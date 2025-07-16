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
    // Загружаем сохраненные данные
    const data = await chrome.storage.local.get(['activeProfile'])
    if (data.activeProfile) {
        await applyProxy(data.activeProfile)
    }
    updateBadge()
}

// Применение настроек прокси
async function applyProxy(profile) {
    try {
        console.log('🔄 Применяем прокси профиль:', profile)

        // Очищаем предыдущие настройки
        await chrome.proxy.settings.clear({})

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

        // Сохраняем учетные данные для webRequestAuthProvider
        if (profile.username && profile.password) {
            proxyState.authCredentials = {
                username: profile.username,
                password: profile.password,
            }
            console.log('🔐 Учетные данные сохранены для webRequestAuthProvider')
        } else {
            proxyState.authCredentials = null
            console.log('📝 Прокси без авторизации')
        }

        proxyState.activeProfile = profile
        proxyState.isActive = true
        await chrome.storage.local.set({ activeProfile: profile })

        updateBadge() // Обновляем badge после применения прокси
        console.log('🎉 Прокси успешно применен')
        return { success: true }
    } catch (error) {
        console.error('❌ Ошибка применения прокси:', error)
        return { success: false, error: error.message }
    }
}

// Настройка множественных правил авторизации
async function setupMultipleAuthRules(username, password) {
    try {
        console.log('Настройка множественных правил авторизации для:', username)

        // Кодируем учетные данные - только ASCII символы
        const credentials = btoa(unescape(encodeURIComponent(`${username}:${password}`)))
        console.log('Сгенерированы учетные данные')

        // Создаем несколько правил с разными приоритетами
        const rules = [
            // Высокий приоритет для главных фреймов
            {
                id: RULE_ID,
                priority: 100,
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
                    resourceTypes: ['main_frame'],
                },
            },
            // Средний приоритет для подфреймов и XHR
            {
                id: RULE_ID + 1,
                priority: 90,
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
                    resourceTypes: ['sub_frame', 'xmlhttprequest'],
                },
            },
            // Обычный приоритет для остальных ресурсов
            {
                id: RULE_ID + 2,
                priority: 80,
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
                    resourceTypes: ['stylesheet', 'script', 'image', 'font', 'websocket', 'media', 'object', 'ping', 'other'],
                },
            },
        ]

        // Применяем все правила
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: rules,
        })

        // Проверяем установленные правила
        const activeRules = await chrome.declarativeNetRequest.getDynamicRules()
        const ourRules = activeRules.filter((r) => [RULE_ID, RULE_ID + 1, RULE_ID + 2].includes(r.id))

        console.log(`✅ Установлено ${ourRules.length} правил авторизации`)
    } catch (error) {
        console.error('Ошибка настройки множественных правил:', error)
        throw error
    }
}

// Отключение прокси
async function disableProxy() {
    try {
        console.log('🔌 Отключаем прокси...')

        await chrome.proxy.settings.clear({})

        proxyState.activeProfile = null
        proxyState.isActive = false
        proxyState.authCredentials = null

        await chrome.storage.local.remove(['activeProfile'])
        updateBadge() // Обновляем badge после отключения прокси
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

        // Создаем более универсальное правило
        const rule = {
            id: RULE_ID,
            priority: 10, // Повышенный приоритет
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
                // Убираем ограничения на типы ресурсов
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

        // Применяем правило
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [rule],
        })

        // Проверяем, что правило действительно добавлено
        const activeRules = await chrome.declarativeNetRequest.getDynamicRules()
        const ourRule = activeRules.find((r) => r.id === RULE_ID)

        if (ourRule) {
            console.log('✅ Правило авторизации успешно установлено')
            console.log('Детали правила:', ourRule)
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
        // Игнорируем ошибки очистки (правила могут не существовать)
        console.log('Правила авторизации уже очищены или не существовали')
    }
}

// Обновление динамического индикатора (badge)
function updateBadge() {
    if (proxyState.isActive) {
        // Прокси включен - зеленый цвет и точка
        chrome.action.setBadgeText({ text: '●' })
        chrome.action.setBadgeBackgroundColor({ color: '#10b981' }) // Зеленый
        chrome.action.setTitle({ title: `Proxy Manager - Активен: ${proxyState.activeProfile?.name || 'Неизвестно'}` })
    } else {
        // Прокси отключен - желтый цвет и точка
        chrome.action.setBadgeText({ text: '●' })
        chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' }) // Желтый
        chrome.action.setTitle({ title: 'Proxy Manager - Отключен' })
    }

    console.log('🔄 Badge обновлен:', proxyState.isActive ? 'зеленый (активен)' : 'желтый (отключен)')
}

// Обработка запросов авторизации (с блокировкой через webRequestAuthProvider)
chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
        console.log('🔑 Запрос авторизации прокси:', {
            url: details.url.substring(0, 50) + '...',
            isProxy: details.isProxy,
            challenger: details.challenger,
            realm: details.realm,
        })

        // Предоставляем учетные данные если это прокси-авторизация
        if (details.isProxy && proxyState.authCredentials) {
            console.log('✅ Предоставляем учетные данные для прокси:', {
                username: proxyState.authCredentials.username,
                hasPassword: !!proxyState.authCredentials.password,
            })

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
    }
})

console.log('Simple Proxy Manager загружен')
console.log('Используется множественная авторизация через declarativeNetRequest')
console.log('Динамический badge: желтый (отключен) / зеленый (включен)')
