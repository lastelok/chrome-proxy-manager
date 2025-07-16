// Состояние прокси
let proxyState = {
    activeProfile: null,
    isActive: false,
    authCredentials: null,
}

// Константы для правил
const RULE_ID = 1

// Инициализация при установке/запуске
chrome.runtime.onInstalled.addListener(initExtension)
chrome.runtime.onStartup.addListener(initExtension)

async function initExtension() {
    // Синхронизируем состояние с реальными настройками Chrome
    await syncProxyState()
    updateBadge()
}

// Проверка и синхронизация состояния прокси с Chrome
async function syncProxyState() {
    try {
        // Получаем текущие настройки прокси из Chrome
        const currentSettings = await chrome.proxy.settings.get({})

        // Загружаем сохраненные данные
        const data = await chrome.storage.local.get(['activeProfile'])

        console.log('🔄 Синхронизация состояния прокси:', {
            chromeMode: currentSettings.value.mode,
            hasActiveProfile: !!data.activeProfile,
            currentRules: currentSettings.value.rules,
        })

        // Если в Chrome настроен прокси, но у нас нет активного профиля
        if (currentSettings.value.mode === 'fixed_servers' && data.activeProfile) {
            console.log('✅ Найден активный прокси, восстанавливаем состояние')

            // Восстанавливаем состояние из сохраненного профиля
            proxyState.activeProfile = data.activeProfile
            proxyState.isActive = true

            // Восстанавливаем учетные данные для авторизации
            if (data.activeProfile.username && data.activeProfile.password) {
                proxyState.authCredentials = {
                    username: data.activeProfile.username,
                    password: data.activeProfile.password,
                }
            }
        } else if (currentSettings.value.mode === 'direct') {
            console.log('🔌 Chrome в режиме прямого подключения')

            // Очищаем состояние если Chrome в прямом режиме
            proxyState.activeProfile = null
            proxyState.isActive = false
            proxyState.authCredentials = null

            // Очищаем сохраненный профиль
            await chrome.storage.local.remove(['activeProfile'])
        } else if (currentSettings.value.mode === 'fixed_servers' && !data.activeProfile) {
            console.log('⚠️ В Chrome настроен прокси, но нет сохраненного профиля - отключаем')

            // Отключаем прокси если настроен, но нет информации о профиле
            await chrome.proxy.settings.clear({})
            proxyState.activeProfile = null
            proxyState.isActive = false
            proxyState.authCredentials = null
        }
    } catch (error) {
        console.error('❌ Ошибка синхронизации состояния прокси:', error)

        // В случае ошибки сбрасываем состояние
        proxyState.activeProfile = null
        proxyState.isActive = false
        proxyState.authCredentials = null
    }
}

// Применение настроек прокси
async function applyProxy(profile) {
    try {
        console.log('🔄 Применяем прокси профиль:', profile)

        // Очищаем предыдущие настройки
        await chrome.proxy.settings.clear({})
        await clearAuthRules()

        // Настройка прокси
        const config = {
            mode: 'fixed_servers',
            rules: {
                singleProxy: {
                    scheme: profile.type || 'http',
                    host: profile.host,
                    port: parseInt(profile.port),
                },
                bypassList: ['localhost', '127.0.0.1', '<local>'],
            },
        }

        await chrome.proxy.settings.set({ value: config, scope: 'regular' })
        console.log('✅ Прокси настройки применены:', config)

        // Настройка авторизации если нужно
        if (profile.username && profile.password) {
            await setupAuthRules(profile.username, profile.password)
            proxyState.authCredentials = {
                username: profile.username,
                password: profile.password,
            }
            console.log('🔐 Учетные данные сохранены для авторизации')
        } else {
            proxyState.authCredentials = null
            console.log('📝 Прокси без авторизации')
        }

        // Обновляем состояние
        proxyState.activeProfile = profile
        proxyState.isActive = true
        await chrome.storage.local.set({ activeProfile: profile })

        updateBadge()
        console.log('🎉 Прокси успешно применен')
        return { success: true }
    } catch (error) {
        console.error('❌ Ошибка применения прокси:', error)

        // В случае ошибки сбрасываем состояние
        proxyState.activeProfile = null
        proxyState.isActive = false
        proxyState.authCredentials = null
        await chrome.storage.local.remove(['activeProfile'])
        updateBadge()

        return { success: false, error: error.message }
    }
}

// Отключение прокси
async function disableProxy() {
    try {
        console.log('🔌 Отключаем прокси...')

        await chrome.proxy.settings.clear({})
        await clearAuthRules()

        proxyState.activeProfile = null
        proxyState.isActive = false
        proxyState.authCredentials = null

        await chrome.storage.local.remove(['activeProfile'])
        updateBadge()
        console.log('✅ Прокси успешно отключен')
        return { success: true }
    } catch (error) {
        console.error('❌ Ошибка отключения прокси:', error)
        return { success: false, error: error.message }
    }
}

// Настройка авторизации через declarativeNetRequest
async function setupAuthRules(username, password) {
    try {
        console.log('Настройка авторизации для:', username)

        const credentials = btoa(`${username}:${password}`)
        console.log('Сгенерированы учетные данные, длина:', credentials.length)

        const rule = {
            id: RULE_ID,
            priority: 10,
            action: {
                type: 'modifyHeaders',
                requestHeaders: [
                    {
                        header: 'Proxy-Authorization',
                        operation: 'set',
                        value: `Basic ${credentials}`,
                    },
                ],
            },
            condition: {
                resourceTypes: [
                    'main_frame',
                    'sub_frame',
                    'stylesheet',
                    'script',
                    'image',
                    'font',
                    'xmlhttprequest',
                    'other',
                    'websocket',
                    'media',
                    'object',
                    'ping',
                ],
            },
        }

        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [rule],
        })

        const activeRules = await chrome.declarativeNetRequest.getDynamicRules()
        const ourRule = activeRules.find((r) => r.id === RULE_ID)

        if (ourRule) {
            console.log('✅ Правило авторизации успешно установлено')
        } else {
            console.error('❌ Правило авторизации не было добавлено')
        }
    } catch (error) {
        console.error('Ошибка настройки авторизации:', error)
        throw error
    }
}

// Очистка правил авторизации
async function clearAuthRules() {
    try {
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [RULE_ID, RULE_ID + 1, RULE_ID + 2],
        })
        console.log('Все правила авторизации очищены')
    } catch (error) {
        console.log('Правила авторизации уже очищены или не существовали')
    }
}

// Обновление динамического индикатора (badge)
function updateBadge() {
    if (proxyState.isActive && proxyState.activeProfile) {
        // Прокси включен - зеленый цвет и точка
        chrome.action.setBadgeText({ text: '●' })
        chrome.action.setBadgeBackgroundColor({ color: '#10b981' }) // Зеленый
        chrome.action.setTitle({ title: `Proxy Manager - Активен: ${proxyState.activeProfile.name}` })
    } else {
        // Прокси отключен - желтый цвет и точка
        chrome.action.setBadgeText({ text: '●' })
        chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }) // Желтый
        chrome.action.setTitle({ title: 'Proxy Manager - Отключен' })
    }

    console.log('🔄 Badge обновлен:', proxyState.isActive ? 'зеленый (активен)' : 'желтый (отключен)')
}

// Обработка запросов авторизации
chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
        console.log('🔑 Запрос авторизации прокси:', {
            url: details.url.substring(0, 50) + '...',
            isProxy: details.isProxy,
        })

        if (details.isProxy && proxyState.authCredentials) {
            console.log('✅ Предоставляем учетные данные для прокси')
            callback({
                authCredentials: {
                    username: proxyState.authCredentials.username,
                    password: proxyState.authCredentials.password,
                },
            })
        } else {
            console.log('❌ Нет учетных данных или не прокси-запрос')
            callback({})
        }
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
)

// Обработка ошибок прокси
chrome.proxy.onProxyError.addListener((details) => {
    console.error('Ошибка прокси:', details)
    if (details.error) {
        chrome.runtime
            .sendMessage({
                action: 'proxyError',
                error: details.error,
            })
            .catch(() => {})
    }
})

// Обработка сообщений от popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'getStatus':
            sendResponse({
                isActive: proxyState.isActive,
                activeProfile: proxyState.activeProfile,
            })
            break

        case 'applyProxy':
            applyProxy(request.profile).then(sendResponse)
            return true

        case 'disableProxy':
            disableProxy().then(sendResponse)
            return true

        case 'updateBadge':
            updateBadge()
            sendResponse({ success: true })
            break

        case 'syncState':
            syncProxyState().then(() => {
                updateBadge()
                sendResponse({ success: true })
            })
            return true
    }
})

console.log('Simple Proxy Manager загружен')
console.log('Динамический badge: желтый (отключен) / зеленый (включен)')
console.log('Добавлена синхронизация состояния с Chrome API')
