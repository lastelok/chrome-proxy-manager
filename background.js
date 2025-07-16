// Состояние прокси
let proxyState = {
    currentProxy: null,
    authCredentials: null,
    isActive: false,
}

// Кеш геолокации
let geoCache = new Map()

// Хранилище для последних учетных данных
let pendingAuthCredentials = null

// Инициализация расширения
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Chrome Proxy Manager установлен')
    } else if (details.reason === 'update') {
        console.log('Chrome Proxy Manager обновлен с версии:', details.previousVersion)
    }
    initializeExtension()
    setupSidePanel()
})

chrome.runtime.onStartup.addListener(() => {
    initializeExtension()
})

// Настройка боковой панели
function setupSidePanel() {
    chrome.sidePanel
        .setPanelBehavior({
            openPanelOnActionClick: false,
        })
        .catch((err) => {
            console.error('Ошибка настройки боковой панели:', err)
        })
}

// Инициализация расширения
async function initializeExtension() {
    try {
        // Загружаем сохраненные данные
        const result = await chrome.storage.local.get(['activeProfile', 'activeProfileId', 'geoCache'])
        
        // Восстанавливаем кеш геолокации
        if (result.geoCache) {
            geoCache = new Map(Object.entries(result.geoCache))
        }
        
        // Проверяем текущие настройки прокси в браузере
        const config = await chrome.proxy.settings.get({})
        const isProxyCurrentlyActive = config.value && config.value.mode !== 'direct' && config.value.mode !== 'system'

        if (result.activeProfile && result.activeProfileId) {
            // Восстанавливаем состояние с правильными учетными данными
            proxyState.currentProxy = result.activeProfile
            proxyState.authCredentials = {
                username: result.activeProfile.username || '',
                password: result.activeProfile.password || '',
            }
            proxyState.isActive = true
            
            // Устанавливаем учетные данные для ожидающих запросов
            pendingAuthCredentials = proxyState.authCredentials

            console.log('🔄 Восстановлены учетные данные из сохраненного профиля:', {
                username: proxyState.authCredentials.username || 'НЕ УКАЗАН',
                password: proxyState.authCredentials.password ? '***' : 'НЕ УКАЗАН',
                host: result.activeProfile.host,
                port: result.activeProfile.port
            })

            if (!isProxyCurrentlyActive) {
                await applyProxyProfile(result.activeProfile)
            } else {
                updateBadge(true)
            }
        } else {
            proxyState.isActive = isProxyCurrentlyActive
            updateBadge(proxyState.isActive)
        }
    } catch (error) {
        console.error('Ошибка инициализации:', error)
        updateBadge(false)
    }
}

// Определение геолокации по IP
async function getGeoLocation(ip) {
    // Проверяем кеш
    if (geoCache.has(ip)) {
        return geoCache.get(ip)
    }

    try {
        // Используем бесплатный API для определения геолокации
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,timezone`)
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        
        if (data.status === 'success') {
            const geoInfo = {
                country: data.country || 'Неизвестно',
                countryCode: data.countryCode ? data.countryCode.toLowerCase() : null,
                city: data.city || null,
                timezone: data.timezone || null,
                lastUpdated: Date.now()
            }
            
            // Сохраняем в кеш
            geoCache.set(ip, geoInfo)
            
            // Сохраняем кеш в storage (с ограничением размера)
            if (geoCache.size > 100) {
                // Удаляем старые записи
                const entries = Array.from(geoCache.entries())
                entries.sort((a, b) => (a[1].lastUpdated || 0) - (b[1].lastUpdated || 0))
                
                // Оставляем только 50 самых новых записей
                geoCache.clear()
                entries.slice(-50).forEach(([key, value]) => {
                    geoCache.set(key, value)
                })
            }
            
            // Сохраняем обновленный кеш
            await saveGeoCache()
            
            return geoInfo
        } else {
            throw new Error('API вернул ошибку')
        }
    } catch (error) {
        console.error('Ошибка определения геолокации:', error)
        
        // Возвращаем значение по умолчанию
        const defaultGeo = {
            country: 'Неизвестно',
            countryCode: null,
            city: null,
            timezone: null,
            lastUpdated: Date.now()
        }
        
        geoCache.set(ip, defaultGeo)
        return defaultGeo
    }
}

// Сохранение кеша геолокации
async function saveGeoCache() {
    try {
        const cacheObject = Object.fromEntries(geoCache)
        await chrome.storage.local.set({ geoCache: cacheObject })
    } catch (error) {
        console.error('Ошибка сохранения кеша геолокации:', error)
    }
}

// Обновление индикатора в тулбаре
function updateBadge(isActive) {
    proxyState.isActive = isActive

    const badgeText = isActive ? '●' : '○'
    const badgeColor = isActive ? '#10b981' : '#ef4444'
    const title = `Chrome Proxy Manager - ${isActive ? 'Активно' : 'Отключено'}`

    chrome.action.setBadgeText({ text: badgeText })
    chrome.action.setBadgeBackgroundColor({ color: badgeColor })
    chrome.action.setTitle({ title })
}

// Применение настроек прокси
async function applyProxyProfile(profile) {
    try {
        if (!profile || !profile.host || !profile.port) {
            throw new Error('Некорректные данные профиля')
        }

        console.log('🔄 Применяем профиль прокси:', profile.name)

        // ВАЖНО: Устанавливаем учетные данные ДО применения прокси
        if (profile.username && profile.password) {
            pendingAuthCredentials = {
                username: profile.username,
                password: profile.password,
            }
            console.log('🔐 Предустановлены учетные данные для немедленной авторизации')
        } else {
            pendingAuthCredentials = null
        }

        // Очищаем любые предыдущие настройки прокси
        await chrome.proxy.settings.clear({})

        // Небольшая задержка для очистки
        await new Promise(resolve => setTimeout(resolve, 100))

        // Устанавливаем учетные данные в состояние
        proxyState.authCredentials = {
            username: profile.username || '',
            password: profile.password || '',
        }

        console.log('✅ Установлены учетные данные для прокси:', {
            username: profile.username || 'НЕ УКАЗАН',
            password: profile.password ? '***' : 'НЕ УКАЗАН',
            host: profile.host,
            port: profile.port,
            profileName: profile.name
        })

        // Конфигурация прокси - используем фиксированные серверы для всех типов прокси
        const proxyConfig = {
            mode: 'fixed_servers',
            rules: {
                singleProxy: {
                    scheme: profile.type || 'http',
                    host: profile.host,
                    port: parseInt(profile.port),
                },
                bypassList: ['localhost', '127.0.0.1', '::1', '<local>'],
            },
        }

        console.log('📡 Применяем конфигурацию прокси:', proxyConfig)

        // Применяем настройки
        await chrome.proxy.settings.set({
            value: proxyConfig,
            scope: 'regular',
        })

        // Обновляем состояние
        proxyState.currentProxy = profile
        proxyState.isActive = true
        updateBadge(true)

        // Сохраняем активный профиль со всеми данными включая учетные данные
        await chrome.storage.local.set({
            activeProfile: profile,
            activeProfileId: profile.id,
        })

        console.log('✅ Прокси успешно применен:', profile.name)
        console.log('🔐 Учетные данные готовы для немедленного использования')
        
        return { success: true }
    } catch (error) {
        console.error('❌ Ошибка применения прокси:', error)
        // Сбрасываем ожидающие учетные данные при ошибке
        pendingAuthCredentials = null
        notifyError(error.message)
        return { success: false, error: error.message }
    }
}

// Отключение прокси
async function disableProxy() {
    try {
        await chrome.proxy.settings.clear({})

        // Обновляем состояние
        proxyState.currentProxy = null
        proxyState.authCredentials = null
        proxyState.isActive = false
        pendingAuthCredentials = null
        updateBadge(false)

        // Очищаем сохраненные данные
        await chrome.storage.local.remove(['activeProfile', 'activeProfileId'])

        console.log('🔌 Прокси отключен')
        return { success: true }
    } catch (error) {
        console.error('❌ Ошибка отключения прокси:', error)
        notifyError(error.message)
        return { success: false, error: error.message }
    }
}

// Счетчик попыток авторизации для предотвращения зацикливания
let authAttempts = new Map()

// Улучшенный обработчик аутентификации прокси
chrome.webRequest.onAuthRequired.addListener(
    (details) => {
        console.log('🔑 Запрос аутентификации!')
        console.log('📍 URL:', details.url)
        console.log('🔗 Challenger:', details.challenger)
        console.log('🔀 IsProxy:', details.isProxy)
        console.log('🔒 Scheme:', details.scheme)
        console.log('🌐 Realm:', details.realm)
        console.log('🆔 RequestId:', details.requestId)
        
        // Проверяем, что это именно прокси-аутентификация
        if (!details.isProxy) {
            console.log('❌ Это не прокси-аутентификация, пропускаем')
            return { cancel: false }
        }
        
        // Проверяем количество попыток для этого запроса
        const attemptKey = `${details.requestId}_${details.url}`
        const attempts = authAttempts.get(attemptKey) || 0
        
        if (attempts >= 2) {
            console.log('❌ Превышено количество попыток авторизации для запроса')
            authAttempts.delete(attemptKey)
            return { cancel: true }
        }
        
        // Сначала проверяем ожидающие учетные данные
        let credentials = pendingAuthCredentials || proxyState.authCredentials
        
        // Проверяем наличие учетных данных
        if (credentials && credentials.username && credentials.password) {
            console.log('✅ Предоставляем учетные данные для прокси:')
            console.log('👤 Username:', credentials.username)
            console.log('🔐 Password: ***')
            console.log('📋 Профиль:', proxyState.currentProxy?.name || 'Неизвестно')
            console.log('⏱️ Попытка:', attempts + 1)
            
            // Увеличиваем счетчик попыток
            authAttempts.set(attemptKey, attempts + 1)
            
            // Очищаем счетчик через 5 секунд
            setTimeout(() => {
                authAttempts.delete(attemptKey)
            }, 5000)
            
            return {
                authCredentials: {
                    username: credentials.username,
                    password: credentials.password
                }
            }
        }
        
        console.log('❌ Нет сохраненных учетных данных для прокси')
        console.log('📊 Текущие учетные данные:', {
            pending: pendingAuthCredentials,
            current: proxyState.authCredentials,
            profile: proxyState.currentProxy?.name || 'Нет активного профиля'
        })
        
        // Отменяем запрос, чтобы избежать показа диалога
        return { cancel: true }
    },
    { 
        urls: ['<all_urls>']
    },
    ['blocking']
)

// Очистка старых записей счетчика попыток каждые 30 секунд
setInterval(() => {
    if (authAttempts.size > 0) {
        console.log('🧹 Очистка счетчика попыток авторизации')
        authAttempts.clear()
    }
}, 30000)

// Дополнительный обработчик для отслеживания всех запросов
chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
        if (proxyState.isActive && proxyState.currentProxy && details.type === 'main_frame') {
            console.log('📡 Основной запрос через прокси:', details.url.substring(0, 100))
        }
    },
    { urls: ['<all_urls>'] },
    []
)

// Получение текущего статуса
function getStatus() {
    return {
        isActive: proxyState.isActive,
        currentProfile: proxyState.currentProxy,
    }
}

// Открытие боковой панели
async function openSidePanel(windowId) {
    try {
        await chrome.sidePanel.open({ windowId })
        return { success: true }
    } catch (error) {
        console.error('Ошибка открытия боковой панели:', error)
        return { success: false, error: error.message }
    }
}

// Уведомление об ошибке
function notifyError(errorMessage) {
    chrome.runtime
        .sendMessage({
            action: 'proxyError',
            error: errorMessage,
        })
        .catch(() => {
            // Игнорируем ошибку, если нет получателей
        })
}

// Обработка сообщений от popup/sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'applyProxy':
            applyProxyProfile(request.profile)
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ success: false, error: error.message }))
            return true

        case 'disableProxy':
            disableProxy()
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ success: false, error: error.message }))
            return true

        case 'getStatus':
            sendResponse(getStatus())
            break

        case 'getGeoLocation':
            getGeoLocation(request.ip)
                .then((result) => sendResponse({ success: true, data: result }))
                .catch((error) => sendResponse({ success: false, error: error.message }))
            return true

        case 'openSidePanel':
            openSidePanel(request.windowId)
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ success: false, error: error.message }))
            return true

        case 'debugAuth':
            console.log('🔍 === ОТЛАДОЧНАЯ ИНФОРМАЦИЯ ===')
            console.log('🔀 Активен ли прокси:', proxyState.isActive)
            console.log('📋 Текущий профиль:', proxyState.currentProxy)
            console.log('🔐 Учетные данные:', {
                username: proxyState.authCredentials?.username || 'НЕ ЗАДАН',
                password: proxyState.authCredentials?.password ? 'ЗАДАН' : 'НЕ ЗАДАН',
                fullObject: proxyState.authCredentials
            })
            console.log('⏳ Ожидающие учетные данные:', {
                username: pendingAuthCredentials?.username || 'НЕ ЗАДАН',
                password: pendingAuthCredentials?.password ? 'ЗАДАН' : 'НЕ ЗАДАН',
            })
            console.log('================================')
            
            sendResponse({ 
                success: true, 
                debug: {
                    isActive: proxyState.isActive,
                    currentProfile: proxyState.currentProxy,
                    authCredentials: proxyState.authCredentials,
                    pendingAuthCredentials: pendingAuthCredentials
                }
            })
            break

        default:
            sendResponse({ success: false, error: 'Неизвестное действие' })
    }
})

// Обработка ошибок прокси - исправленная версия
chrome.proxy.onProxyError.addListener((details) => {
    // Правильно выводим детали ошибки
    console.error('💥 Ошибка прокси:', {
        error: details.error,
        details: details.details,
        fatal: details.fatal
    })

    if (details.fatal) {
        // НЕ сбрасываем состояние автоматически при ошибке
        // Пользователь должен сам решить, что делать
        notifyError(details.error || 'Критическая ошибка прокси-сервера')
        
        // Добавляем специальное сообщение об ошибке подключения
        chrome.runtime
            .sendMessage({
                action: 'proxyConnectionError',
                error: details.error || 'Ошибка подключения к прокси-серверу',
                fatal: details.fatal
            })
            .catch(() => {
                // Игнорируем ошибку, если нет получателей
            })
    }
})

// Отслеживание изменений настроек прокси
chrome.proxy.settings.onChange.addListener((details) => {
    console.log('⚙️ Изменились настройки прокси:', details)
    
    const isProxyActive = details.value && details.value.mode !== 'direct' && details.value.mode !== 'system'

    // Если прокси был отключен извне, обновляем состояние
    if (!isProxyActive && proxyState.currentProxy) {
        console.log('🔌 Прокси отключен извне')
        proxyState.currentProxy = null
        proxyState.authCredentials = null
        proxyState.isActive = false
        pendingAuthCredentials = null
        updateBadge(false)

        chrome.storage.local
            .remove(['activeProfile', 'activeProfileId'])
            .catch((err) => console.error('Ошибка очистки данных:', err))
    } else if (isProxyActive && !proxyState.currentProxy) {
        // Прокси включен извне
        console.log('🔗 Прокси включен извне')
        proxyState.isActive = true
        updateBadge(true)
    }
})

// Обработчик завершенных запросов для сброса ожидающих учетных данных
chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (details.type === 'main_frame' && pendingAuthCredentials) {
            // Сбрасываем ожидающие учетные данные после успешной загрузки страницы
            console.log('✅ Запрос успешно завершен, сбрасываем временные учетные данные')
            pendingAuthCredentials = null
        }
    },
    { urls: ['<all_urls>'] }
)

console.log('🚀 Chrome Proxy Manager инициализирован с улучшенной поддержкой аутентификации')
console.log('🔐 Система автоматически предоставляет учетные данные без показа диалога')
