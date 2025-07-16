// Состояние прокси
let proxyState = {
    currentProxy: null,
    authCredentials: null,
    isActive: false,
}

// Кеш геолокации
let geoCache = new Map()

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

        // Очищаем любые предыдущие настройки прокси
        await chrome.proxy.settings.clear({})

        // Небольшая задержка для очистки
        await new Promise(resolve => setTimeout(resolve, 100))

        // ВАЖНО: Устанавливаем учетные данные ДО применения прокси
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

        // Конфигурация прокси
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

// Счетчик попыток авторизации для каждого уникального прокси
let authAttempts = new Map()

// Упрощенный и надежный обработчик аутентификации прокси
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
        
        // Создаем уникальный ключ для прокси-сервера
        const proxyKey = `${details.challenger?.host || 'unknown'}:${details.challenger?.port || 'unknown'}`
        const attempts = authAttempts.get(proxyKey) || 0
        
        // Ограничиваем количество попыток для конкретного прокси-сервера
        if (attempts >= 3) {
            console.log('❌ Превышено количество попыток авторизации для прокси:', proxyKey)
            return { cancel: true }
        }
        
        // Проверяем наличие учетных данных
        if (proxyState.authCredentials && proxyState.authCredentials.username && proxyState.authCredentials.password) {
            console.log('✅ Предоставляем учетные данные для прокси:')
            console.log('👤 Username:', proxyState.authCredentials.username)
            console.log('🔐 Password: ***')
            console.log('📋 Профиль:', proxyState.currentProxy?.name || 'Неизвестно')
            console.log('🌐 Прокси-сервер:', proxyKey)
            console.log('⏱️ Попытка:', attempts + 1)
            
            // Увеличиваем счетчик попыток для этого прокси
            authAttempts.set(proxyKey, attempts + 1)
            
            // Очищаем счетчик через 30 секунд для успешных подключений
            setTimeout(() => {
                if (authAttempts.get(proxyKey) <= 3) {
                    authAttempts.delete(proxyKey)
                    console.log('🧹 Очищен счетчик попыток для прокси:', proxyKey)
                }
            }, 30000)
            
            return {
                authCredentials: {
                    username: proxyState.authCredentials.username,
                    password: proxyState.authCredentials.password
                }
            }
        }
        
        console.log('❌ Нет сохраненных учетных данных для прокси')
        console.log('📊 Текущие учетные данные:', {
            hasCredentials: !!proxyState.authCredentials,
            hasUsername: !!(proxyState.authCredentials?.username),
            hasPassword: !!(proxyState.authCredentials?.password),
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

// Очистка старых записей счетчика попыток каждую минуту
setInterval(() => {
    if (authAttempts.size > 0) {
        console.log('🧹 Очистка счетчика попыток авторизации, размер:', authAttempts.size)
        // Удаляем записи старше 5 минут
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
        for (const [key, attempts] of authAttempts.entries()) {
            if (attempts >= 3) {
                authAttempts.delete(key)
            }
        }
    }
}, 60000)

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

// Функция для принудительной очистки счетчика попыток
function resetAuthAttempts() {
    authAttempts.clear()
    console.log('🔄 Счетчик попыток авторизации принудительно очищен')
}

// Обработка сообщений от popup/sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'applyProxy':
            // Очищаем счетчик попыток при переключении профиля
            resetAuthAttempts()
            applyProxyProfile(request.profile)
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ success: false, error: error.message }))
            return true

        case 'disableProxy':
            resetAuthAttempts()
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

        case 'resetAuth':
            resetAuthAttempts()
            sendResponse({ success: true, message: 'Счетчик попыток авторизации сброшен' })
            break

        case 'debugAuth':
            console.log('🔍 === ОТЛАДОЧНАЯ ИНФОРМАЦИЯ ===')
            console.log('🔀 Активен ли прокси:', proxyState.isActive)
            console.log('📋 Текущий профиль:', proxyState.currentProxy)
            console.log('🔐 Учетные данные:', {
                username: proxyState.authCredentials?.username || 'НЕ ЗАДАН',
                password: proxyState.authCredentials?.password ? 'ЗАДАН' : 'НЕ ЗАДАН',
                fullObject: proxyState.authCredentials
            })
            console.log('🔢 Попытки авторизации:', Object.fromEntries(authAttempts))
            console.log('================================')
            
            sendResponse({ 
                success: true, 
                debug: {
                    isActive: proxyState.isActive,
                    currentProfile: proxyState.currentProxy,
                    authCredentials: proxyState.authCredentials,
                    authAttempts: Object.fromEntries(authAttempts)
                }
            })
            break

        default:
            sendResponse({ success: false, error: 'Неизвестное действие' })
    }
})

// Обработка ошибок прокси
chrome.proxy.onProxyError.addListener((details) => {
    console.error('💥 Ошибка прокси:', {
        error: details.error,
        details: details.details,
        fatal: details.fatal
    })

    if (details.fatal) {
        notifyError(details.error || 'Критическая ошибка прокси-сервера')
        
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
        resetAuthAttempts()
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

// Обработчик успешных запросов для сброса счетчика ошибок
chrome.webRequest.onCompleted.addListener(
    (details) => {
        if (details.type === 'main_frame' && proxyState.isActive && details.statusCode === 200) {
            // При успешном запросе через прокси сбрасываем счетчик ошибок для данного прокси
            if (proxyState.currentProxy) {
                const proxyKey = `${proxyState.currentProxy.host}:${proxyState.currentProxy.port}`
                if (authAttempts.has(proxyKey)) {
                    authAttempts.delete(proxyKey)
                    console.log('✅ Успешный запрос, сброшен счетчик ошибок для:', proxyKey)
                }
            }
        }
    },
    { urls: ['<all_urls>'] }
)

console.log('🚀 Chrome Proxy Manager инициализирован с улучшенной системой аутентификации')
console.log('🔐 Система автоматически предоставляет учетные данные без показа диалога')
console.log('🔄 Добавлена автоматическая очистка счетчика попыток при переключении профилей')
