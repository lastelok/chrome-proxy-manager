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
            // Восстанавливаем состояние
            proxyState.currentProxy = result.activeProfile
            proxyState.authCredentials = {
                username: result.activeProfile.username || '',
                password: result.activeProfile.password || '',
            }
            proxyState.isActive = true

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

        // Сохраняем учетные данные для аутентификации
        proxyState.authCredentials = {
            username: profile.username || '',
            password: profile.password || '',
        }

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

        // Применяем настройки
        await chrome.proxy.settings.set({
            value: proxyConfig,
            scope: 'regular',
        })

        // Обновляем состояние
        proxyState.currentProxy = profile
        proxyState.isActive = true
        updateBadge(true)

        // Сохраняем активный профиль
        await chrome.storage.local.set({
            activeProfile: profile,
            activeProfileId: profile.id,
        })

        return { success: true }
    } catch (error) {
        console.error('Ошибка применения прокси:', error)
        updateBadge(false)
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

        return { success: true }
    } catch (error) {
        console.error('Ошибка отключения прокси:', error)
        notifyError(error.message)
        return { success: false, error: error.message }
    }
}

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

// Обработка аутентификации
chrome.webRequest.onAuthRequired.addListener(
    (details) => {
        if (proxyState.authCredentials && proxyState.authCredentials.username && proxyState.authCredentials.password) {
            return {
                authCredentials: {
                    username: proxyState.authCredentials.username,
                    password: proxyState.authCredentials.password,
                },
            }
        } else {
            return { cancel: true }
        }
    },
    { urls: ['<all_urls>'] },
    ['blocking']
)

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

        default:
            sendResponse({ success: false, error: 'Неизвестное действие' })
    }
})

// Обработка ошибок прокси
chrome.proxy.onProxyError.addListener((details) => {
    console.error('Ошибка прокси:', details)

    if (details.fatal) {
        proxyState.isActive = false
        updateBadge(false)
        notifyError(details.error || 'Критическая ошибка прокси-сервера')
    }
})

// Отслеживание изменений настроек прокси
chrome.proxy.settings.onChange.addListener((details) => {
    const isProxyActive = details.value && details.value.mode !== 'direct' && details.value.mode !== 'system'

    // Если прокси был отключен извне, обновляем состояние
    if (!isProxyActive && proxyState.currentProxy) {
        proxyState.currentProxy = null
        proxyState.authCredentials = null
        proxyState.isActive = false
        updateBadge(false)

        chrome.storage.local
            .remove(['activeProfile', 'activeProfileId'])
            .catch((err) => console.error('Ошибка очистки данных:', err))
    } else if (isProxyActive && !proxyState.currentProxy) {
        // Прокси включен извне
        proxyState.isActive = true
        updateBadge(true)
    }
})