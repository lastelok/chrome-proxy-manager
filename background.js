// Текущие настройки прокси
let currentProxy = null
let authCredentials = null

// Обновление индикатора статуса
function updateBadge(isActive) {
    chrome.action.setBadgeText({ text: '●' })
    chrome.action.setBadgeBackgroundColor({ color: isActive ? '#4CAF50' : '#e74c3c' })
    chrome.action.setTitle({ title: `Chrome Proxy Manager - ${isActive ? 'Активно' : 'Отключено'}` })
}

// Инициализация
chrome.runtime.onInstalled.addListener(() => {
    initializeExtension()
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
})

chrome.runtime.onStartup.addListener(() => {
    initializeExtension()
})

// Инициализация расширения
function initializeExtension() {
    chrome.storage.local.get(['activeProfile', 'activeProfileId'], (result) => {
        chrome.proxy.settings.get({}, (config) => {
            const isProxyActive = config.value && config.value.mode !== 'direct' && config.value.mode !== 'system'

            if (result.activeProfile && result.activeProfileId) {
                if (!isProxyActive) {
                    applyProxyProfile(result.activeProfile)
                } else {
                    currentProxy = result.activeProfile
                    authCredentials = {
                        username: result.activeProfile.username,
                        password: result.activeProfile.password,
                    }
                    updateBadge(true)
                }
            } else {
                updateBadge(isProxyActive)
            }
        })
    })
}

// Обработка аутентификации
chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
        if (authCredentials && authCredentials.username && authCredentials.password) {
            callback({
                authCredentials: {
                    username: authCredentials.username,
                    password: authCredentials.password,
                },
            })
        } else {
            callback({ cancel: true })
        }
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
)

// Применение настроек прокси
function applyProxyProfile(profile) {
    if (!profile) {
        chrome.proxy.settings.clear({}, () => {
            currentProxy = null
            authCredentials = null
            updateBadge(false)
        })
        return
    }

    if (!profile.host || !profile.port) return

    authCredentials = {
        username: profile.username || '',
        password: profile.password || '',
    }

    const config = {
        mode: 'fixed_servers',
        rules: {
            singleProxy: {
                scheme: profile.type || 'http',
                host: profile.host,
                port: parseInt(profile.port),
            },
            bypassList: ['localhost', '127.0.0.1', '::1'],
        },
    }

    chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
        if (chrome.runtime.lastError) {
            updateBadge(false)
            chrome.runtime
                .sendMessage({
                    action: 'proxyError',
                    error: chrome.runtime.lastError.message,
                })
                .catch(() => {})
        } else {
            currentProxy = profile
            updateBadge(true)
            chrome.storage.local.set({
                activeProfile: profile,
                activeProfileId: profile.id,
            })
        }
    })
}

// Обработка сообщений
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'applyProxy':
            applyProxyProfile(request.profile)
            sendResponse({ success: true })
            break

        case 'disableProxy':
            applyProxyProfile(null)
            chrome.storage.local.remove(['activeProfile', 'activeProfileId'])
            sendResponse({ success: true })
            break

        case 'getStatus':
            sendResponse({
                isActive: currentProxy !== null,
                currentProfile: currentProxy,
            })
            break

        case 'openSidePanel':
            chrome.sidePanel
                .open({ windowId: request.windowId })
                .then(() => sendResponse({ success: true }))
                .catch((error) => sendResponse({ success: false, error: error.message }))
            break
    }
    return true
})

// Обработка ошибок прокси
chrome.proxy.onProxyError.addListener((details) => {
    if (details.fatal) {
        updateBadge(false)
        chrome.runtime
            .sendMessage({
                action: 'proxyError',
                error: details.error || 'Неизвестная ошибка прокси',
            })
            .catch(() => {})
    }
})

// Обработка изменений в настройках прокси
chrome.proxy.settings.onChange.addListener((details) => {
    const isProxyActive = details.value && details.value.mode !== 'direct' && details.value.mode !== 'system'

    if (!isProxyActive && currentProxy) {
        currentProxy = null
        authCredentials = null
        updateBadge(false)
        chrome.storage.local.remove(['activeProfile', 'activeProfileId'])
    }
})
