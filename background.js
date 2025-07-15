// Хранилище для текущих настроек прокси
let currentProxy = null
let authCredentials = null

// Обновление индикатора статуса в иконке
function updateBadge(isActive) {
    if (isActive) {
        chrome.action.setBadgeText({ text: '●' })
        chrome.action.setBadgeBackgroundColor({ color: '#27ae60' }) // Зеленый
        chrome.action.setTitle({ title: 'Proxy By LasT - Активно' })
    } else {
        chrome.action.setBadgeText({ text: '●' })
        chrome.action.setBadgeBackgroundColor({ color: '#e74c3c' }) // Красный
        chrome.action.setTitle({ title: 'Proxy By LasT - Отключено' })
    }
}

// Инициализация при первой установке
chrome.runtime.onInstalled.addListener(() => {
    initializeExtension()

    // Настройка боковой панели
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
})

// Восстановление настроек при запуске браузера
chrome.runtime.onStartup.addListener(() => {
    initializeExtension()
})

// Функция инициализации расширения
function initializeExtension() {
    chrome.storage.local.get(['activeProfile', 'activeProfileId'], (result) => {
        // Проверяем текущее состояние прокси
        chrome.proxy.settings.get({}, (config) => {
            const isProxyActive = config.value && config.value.mode !== 'direct' && config.value.mode !== 'system'

            if (result.activeProfile && result.activeProfileId) {
                // Если есть сохраненный активный профиль
                if (!isProxyActive) {
                    // Прокси не активен, применяем профиль
                    applyProxyProfile(result.activeProfile)
                } else {
                    // Прокси уже активен, просто обновляем состояние
                    currentProxy = result.activeProfile
                    authCredentials = {
                        username: result.activeProfile.username,
                        password: result.activeProfile.password,
                    }
                    updateBadge(true)
                }
            } else if (isProxyActive) {
                // Если прокси активен, но нет сохраненного профиля
                // Это может произойти после сброса настроек
                // Оставляем прокси активным, но обновляем индикатор
                updateBadge(true)
            } else {
                // Прокси не активен и нет сохраненного профиля
                updateBadge(false)
            }
        })
    })
}

// Обработка аутентификации прокси
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
            callback({})
        }
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
)

// Функция применения настроек прокси
function applyProxyProfile(profile) {
    if (!profile) {
        // Отключение прокси
        chrome.proxy.settings.clear({}, () => {
            if (chrome.runtime.lastError) {
                console.error('Ошибка при отключении прокси:', chrome.runtime.lastError.message)
            } else {
                currentProxy = null
                authCredentials = null
                updateBadge(false)
                console.log('Прокси отключен')
            }
        })
        return
    }

    // Проверка валидности данных
    if (!profile.host || !profile.port) {
        console.error('Некорректные данные прокси: отсутствует хост или порт')
        updateBadge(false)
        return
    }

    // Сохранение учетных данных для аутентификации
    authCredentials = {
        username: profile.username || '',
        password: profile.password || '',
    }

    // Настройка прокси
    const config = {
        mode: 'fixed_servers',
        rules: {
            singleProxy: {
                scheme: 'http',
                host: profile.host,
                port: parseInt(profile.port),
            },
            bypassList: ['localhost', '127.0.0.1', '::1'],
        },
    }

    chrome.proxy.settings.set({ value: config, scope: 'regular' }, () => {
        if (chrome.runtime.lastError) {
            console.error('Ошибка установки прокси:', chrome.runtime.lastError.message)
            updateBadge(false)
            // Уведомляем popup об ошибке
            chrome.runtime.sendMessage({
                action: 'proxyError',
                error: chrome.runtime.lastError.message,
            })
        } else {
            currentProxy = profile
            updateBadge(true)
            console.log('Прокси установлен:', profile.name)

            // Сохраняем активный профиль
            chrome.storage.local.set({
                activeProfile: profile,
                activeProfileId: profile.id,
            })
        }
    })
}

// Обработка сообщений от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'applyProxy') {
        applyProxyProfile(request.profile)
        sendResponse({ success: true })
    } else if (request.action === 'disableProxy') {
        applyProxyProfile(null)
        // Очищаем сохраненные данные
        chrome.storage.local.remove(['activeProfile', 'activeProfileId'])
        sendResponse({ success: true })
    } else if (request.action === 'getStatus') {
        sendResponse({
            isActive: currentProxy !== null,
            currentProfile: currentProxy,
        })
    } else if (request.action === 'openSidePanel') {
        chrome.sidePanel.open({ windowId: request.windowId })
        sendResponse({ success: true })
    }
    return true
})

// Обработка ошибок прокси
chrome.proxy.onProxyError.addListener((details) => {
    console.error('Ошибка прокси:')
    console.error('- Ошибка:', details.error)
    console.error('- Детали:', details.details)
    console.error('- Фатальная:', details.fatal)

    // Обновляем значок только для фатальных ошибок
    if (details.fatal) {
        updateBadge(false)
    }
})

// Периодическая проверка соединения
let lastCheckStatus = null
setInterval(() => {
    if (currentProxy) {
        const status = `Прокси активен: ${currentProxy.name}`
        // Выводим в консоль только если статус изменился
        if (status !== lastCheckStatus) {
            console.log(status)
            lastCheckStatus = status
        }
    } else {
        if (lastCheckStatus !== null) {
            console.log('Прокси не активен')
            lastCheckStatus = null
        }
    }
}, 30000) // каждые 30 секунд
