// Состояние прокси
let proxyState = {
    currentProxy: null,
    authCredentials: null,
    isActive: false,
}

// Инициализация расширения
chrome.runtime.onInstalled.addListener(() => {
    console.log('Chrome Proxy Manager установлен')
    initializeExtension()
    setupSidePanel()
})

chrome.runtime.onStartup.addListener(() => {
    console.log('Chrome Proxy Manager запущен')
    initializeExtension()
})

// Настройка боковой панели
function setupSidePanel() {
    chrome.sidePanel
        .setPanelBehavior({
            openPanelOnActionClick: false,
        })
        .catch((err) => {
            console.log('Ошибка настройки боковой панели:', err)
        })
}

// Инициализация расширения
async function initializeExtension() {
    try {
        console.log('Инициализация расширения...')

        // Загружаем сохраненные данные
        const result = await chrome.storage.local.get(['activeProfile', 'activeProfileId'])
        console.log('Загруженные данные:', result)

        // Проверяем текущие настройки прокси в браузере
        const config = await chrome.proxy.settings.get({})
        console.log('Текущие настройки прокси:', config)

        const isProxyCurrentlyActive = config.value && config.value.mode !== 'direct' && config.value.mode !== 'system'

        if (result.activeProfile && result.activeProfileId) {
            console.log('Найден активный профиль:', result.activeProfile.name)

            // Восстанавливаем состояние независимо от текущих настроек браузера
            proxyState.currentProxy = result.activeProfile
            proxyState.authCredentials = {
                username: result.activeProfile.username || '',
                password: result.activeProfile.password || '',
            }
            proxyState.isActive = true

            if (!isProxyCurrentlyActive) {
                console.log('Прокси не активен в браузере, восстанавливаем...')
                await applyProxyProfile(result.activeProfile)
            } else {
                console.log('Прокси уже активен в браузере')
                updateBadge(true)
            }
        } else {
            console.log('Нет активного профиля')
            proxyState.isActive = isProxyCurrentlyActive
            updateBadge(proxyState.isActive)
        }

        console.log('Инициализация завершена, состояние:', proxyState)
    } catch (error) {
        console.error('Ошибка инициализации:', error)
        updateBadge(false)
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

        console.log('Прокси активирован:', profile.name)
        return { success: true }
    } catch (error) {
        console.error('Ошибка применения прокси:', error)
        updateBadge(false)

        // Отправляем ошибку в popup
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

        console.log('Прокси отключен')
        return { success: true }
    } catch (error) {
        console.error('Ошибка отключения прокси:', error)
        notifyError(error.message)
        return { success: false, error: error.message }
    }
}

// Получение текущего статуса
function getStatus() {
    console.log('Запрос статуса, текущее состояние:', proxyState)
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
    // Отправляем сообщение всем активным popup/sidepanel
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
    (details, callback) => {
        console.log('Запрос аутентификации для:', details.url)

        if (proxyState.authCredentials && proxyState.authCredentials.username && proxyState.authCredentials.password) {
            console.log('Предоставляем учетные данные для аутентификации')
            callback({
                authCredentials: {
                    username: proxyState.authCredentials.username,
                    password: proxyState.authCredentials.password,
                },
            })
        } else {
            console.log('Нет учетных данных для аутентификации')
            callback({ cancel: true })
        }
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
)

// Обработка сообщений от popup/sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Получено сообщение:', request.action)

    switch (request.action) {
        case 'applyProxy':
            applyProxyProfile(request.profile)
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ success: false, error: error.message }))
            return true // Асинхронный ответ

        case 'disableProxy':
            disableProxy()
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ success: false, error: error.message }))
            return true // Асинхронный ответ

        case 'getStatus':
            sendResponse(getStatus())
            break

        case 'openSidePanel':
            openSidePanel(request.windowId)
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ success: false, error: error.message }))
            return true // Асинхронный ответ

        default:
            console.warn('Неизвестное действие:', request.action)
            sendResponse({ success: false, error: 'Неизвестное действие' })
    }
})

// Обработка ошибок прокси
chrome.proxy.onProxyError.addListener((details) => {
    console.error('Ошибка прокси:', details)

    if (details.fatal) {
        console.log('Критическая ошибка прокси, отключаем')
        proxyState.isActive = false
        updateBadge(false)

        notifyError(details.error || 'Критическая ошибка прокси-сервера')
    }
})

// Отслеживание изменений настроек прокси
chrome.proxy.settings.onChange.addListener((details) => {
    console.log('Изменение настроек прокси:', details)

    const isProxyActive = details.value && details.value.mode !== 'direct' && details.value.mode !== 'system'

    // Если прокси был отключен извне, обновляем состояние
    if (!isProxyActive && proxyState.currentProxy) {
        console.log('Прокси отключен извне, обновляем состояние')
        proxyState.currentProxy = null
        proxyState.authCredentials = null
        proxyState.isActive = false
        updateBadge(false)

        // Очищаем сохраненные данные
        chrome.storage.local
            .remove(['activeProfile', 'activeProfileId'])
            .then(() => console.log('Данные активного профиля очищены'))
            .catch((err) => console.error('Ошибка очистки данных:', err))
    } else if (isProxyActive && !proxyState.currentProxy) {
        // Прокси включен извне, но у нас нет информации о профиле
        console.log('Прокси включен извне')
        proxyState.isActive = true
        updateBadge(true)
    }
})

// Обработка установки/обновления расширения
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Расширение установлено впервые')
        // Можно показать welcome страницу или инструкции
    } else if (details.reason === 'update') {
        console.log('Расширение обновлено с версии:', details.previousVersion)
        // Можно выполнить миграцию данных если нужно
    }
})

// Обработка приостановки/возобновления расширения
chrome.runtime.onSuspend.addListener(() => {
    console.log('Расширение приостанавливается')
    // Сохраняем критически важные данные
})

// Обработка неожиданного завершения
chrome.runtime.onSuspendCanceled.addListener(() => {
    console.log('Приостановка расширения отменена')
})

// Инициализация при загрузке
console.log('Background script загружен')
