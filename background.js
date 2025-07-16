// Состояние прокси
let proxyState = {
    currentProxy: null,
    authCredentials: null,
    isActive: false,
}

// Кеш геолокации
let geoCache = new Map()

// Генерируем уникальные ID для правил на основе ID расширения
const EXTENSION_ID = chrome.runtime.id
const generateRuleId = (index) => {
    // Используем хеш от ID расширения для генерации уникальных ID
    let hash = 0
    for (let i = 0; i < EXTENSION_ID.length; i++) {
        const char = EXTENSION_ID.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32bit integer
    }
    // Берем только положительные числа и добавляем индекс
    return Math.abs(hash % 1000000) + index
}

// Генерируем уникальные ID правил
const RULE_IDS = Array.from({ length: 5 }, (_, i) => generateRuleId(i + 1))

console.log('🆔 Сгенерированы уникальные ID правил:', RULE_IDS)

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
        // Очищаем ВСЕ динамические правила при старте
        await clearAllDynamicRules()

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
                password: proxyState.authCredentials.password || 'НЕ УКАЗАН',
                host: result.activeProfile.host,
                port: result.activeProfile.port,
            })

            if (!isProxyCurrentlyActive) {
                await applyProxyProfile(result.activeProfile)
            } else {
                updateBadge(true)
                // Восстанавливаем правила авторизации
                if (result.activeProfile.username && result.activeProfile.password) {
                    await setupProxyAuthRules()
                }
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
                lastUpdated: Date.now(),
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
            lastUpdated: Date.now(),
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

// Очистка ВСЕХ динамических правил
async function clearAllDynamicRules() {
    try {
        console.log('🧹 Очищаем ВСЕ динамические правила...')

        // Получаем все существующие динамические правила
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules()

        if (existingRules.length > 0) {
            const allRuleIds = existingRules.map((rule) => rule.id)
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: allRuleIds,
            })
            console.log('🗑️ Удалено правил:', allRuleIds.length)
        }
    } catch (error) {
        console.error('Ошибка очистки правил:', error)
    }
}

// Настройка правил авторизации через declarativeNetRequest
async function setupProxyAuthRules() {
    try {
        console.log('🔧 === НАЧАЛО НАСТРОЙКИ ПРАВИЛ АВТОРИЗАЦИИ ===')

        // Сначала очищаем только наши правила
        await clearProxyAuthRules()

        if (!proxyState.authCredentials || !proxyState.authCredentials.username || !proxyState.authCredentials.password) {
            console.log('🔐 Нет учетных данных для настройки авторизации')
            return false
        }

        // Подробное логирование учетных данных
        console.log('📋 Учетные данные для авторизации:')
        console.log('   Логин:', proxyState.authCredentials.username)
        console.log('   Пароль:', proxyState.authCredentials.password)
        console.log('   Длина логина:', proxyState.authCredentials.username.length)
        console.log('   Длина пароля:', proxyState.authCredentials.password.length)

        // Формируем строку для Base64
        const authString = `${proxyState.authCredentials.username}:${proxyState.authCredentials.password}`
        console.log('🔗 Строка для кодирования:', authString)

        const credentials = btoa(authString)
        console.log('🔑 Base64 строка:', credentials)
        console.log('🔑 Полный заголовок:', `Basic ${credentials}`)

        // Проверяем декодирование для отладки
        const decoded = atob(credentials)
        console.log('🔓 Декодированная строка:', decoded)
        console.log('✅ Проверка: декодирование совпадает?', decoded === authString)

        // Создаем единое правило для всех типов ресурсов
        const rules = [
            {
                id: RULE_IDS[0],
                priority: 1,
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
                        'object',
                        'xmlhttprequest',
                        'ping',
                        'media',
                        'websocket',
                        'other',
                    ],
                },
            },
        ]

        console.log('📝 Добавляем правило:', JSON.stringify(rules[0], null, 2))

        // Применяем правила
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: rules,
        })

        // Проверяем, что правило действительно добавлено
        const activeRules = await chrome.declarativeNetRequest.getDynamicRules()
        const ourRule = activeRules.find((rule) => rule.id === RULE_IDS[0])

        if (ourRule) {
            console.log('✅ Правило авторизации успешно добавлено')
            console.log('📋 Детали добавленного правила:', JSON.stringify(ourRule, null, 2))
            console.log('🔐 === НАСТРОЙКА ПРАВИЛ ЗАВЕРШЕНА УСПЕШНО ===')
            return true
        } else {
            throw new Error('Правило не было добавлено')
        }
    } catch (error) {
        console.error('❌ Ошибка настройки правил авторизации:', error)

        // Диагностика
        try {
            const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
            console.log('🔍 Всего существующих правил:', existingRules.length)
            console.log(
                '🔍 ID существующих правил:',
                existingRules.map((r) => r.id)
            )
        } catch (diagError) {
            console.error('Ошибка диагностики:', diagError)
        }

        return false
    }
}

// Очистка правил авторизации
async function clearProxyAuthRules() {
    try {
        console.log('🧹 Очищаем правила авторизации прокси...')

        // Удаляем только наши правила
        await chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: RULE_IDS,
        })

        console.log('🗑️ Правила авторизации очищены')
    } catch (error) {
        console.error('Ошибка очистки правил авторизации:', error)
    }
}

// Применение настроек прокси
async function applyProxyProfile(profile) {
    try {
        if (!profile || !profile.host || !profile.port) {
            throw new Error('Некорректные данные профиля')
        }

        console.log('🔄 === ПРИМЕНЕНИЕ ПРОФИЛЯ ПРОКСИ ===')
        console.log('📋 Профиль:', {
            name: profile.name,
            host: profile.host,
            port: profile.port,
            type: profile.type || 'http',
            username: profile.username || 'НЕ УКАЗАН',
            password: profile.password || 'НЕ УКАЗАН',
        })

        // Очищаем предыдущие настройки
        await chrome.proxy.settings.clear({})
        await clearProxyAuthRules()

        // Небольшая задержка для корректной очистки
        await new Promise((resolve) => setTimeout(resolve, 100))

        // Устанавливаем учетные данные
        proxyState.authCredentials = {
            username: profile.username || '',
            password: profile.password || '',
        }

        console.log('💾 Сохранены учетные данные в состоянии:')
        console.log('   Логин:', proxyState.authCredentials.username || 'ПУСТО')
        console.log('   Пароль:', proxyState.authCredentials.password || 'ПУСТО')

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

        console.log('📡 Применяем конфигурацию прокси:', JSON.stringify(proxyConfig, null, 2))

        // Применяем настройки прокси
        await chrome.proxy.settings.set({
            value: proxyConfig,
            scope: 'regular',
        })

        // Настраиваем авторизацию если нужно
        let authSuccess = true
        if (profile.username && profile.password) {
            console.log('🔐 Настраиваем авторизацию для профиля с учетными данными')
            authSuccess = await setupProxyAuthRules()

            if (!authSuccess) {
                console.warn('⚠️ Не удалось настроить правила авторизации, но прокси будет работать')
            }
        } else {
            console.log('📝 Прокси без авторизации')
        }

        // Обновляем состояние
        proxyState.currentProxy = profile
        proxyState.isActive = true
        updateBadge(true)

        // Сохраняем активный профиль
        await chrome.storage.local.set({
            activeProfile: profile,
            activeProfileId: profile.id,
        })

        console.log('✅ === ПРОКСИ УСПЕШНО ПРИМЕНЕН ===')
        return { success: true }
    } catch (error) {
        console.error('❌ Ошибка применения прокси:', error)
        await disableProxy()
        return {
            success: false,
            error: error.message || 'Неизвестная ошибка',
        }
    }
}

// Отключение прокси
async function disableProxy() {
    try {
        await chrome.proxy.settings.clear({})
        await clearProxyAuthRules()

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
        return {
            success: false,
            error: error.message || 'Ошибка отключения прокси',
        }
    }
}

// Обработка ошибок сети
chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
        if (proxyState.isActive && details.error) {
            // Логируем только критичные ошибки прокси
            if (
                details.error.includes('ERR_PROXY_AUTH_UNSUPPORTED') ||
                details.error.includes('ERR_PROXY_CONNECTION_FAILED') ||
                details.error.includes('ERR_TUNNEL_CONNECTION_FAILED')
            ) {
                console.error('🚫 Ошибка прокси:', {
                    url: details.url.substring(0, 50) + '...',
                    error: details.error,
                    type: details.type,
                })

                // Уведомляем пользователя только о критичных ошибках
                if (details.error.includes('ERR_PROXY_AUTH_UNSUPPORTED')) {
                    notifyConnectionError('Прокси требует неподдерживаемый тип авторизации')
                } else if (details.error.includes('ERR_TUNNEL_CONNECTION_FAILED')) {
                    notifyConnectionError('Не удается подключиться к прокси-серверу')
                }
            }
        }
    },
    { urls: ['<all_urls>'] }
)

// Обработка запросов авторизации (резервный метод)
chrome.webRequest.onAuthRequired.addListener(
    (details, callback) => {
        console.log('🔑 === ПОЛУЧЕН ЗАПРОС АВТОРИЗАЦИИ ОТ ПРОКСИ ===')
        console.log('📋 Детали запроса:', {
            url: details.url.substring(0, 50) + '...',
            isProxy: details.isProxy,
            realm: details.realm,
            scheme: details.scheme,
            challenger: details.challenger,
        })

        if (details.isProxy && proxyState.authCredentials && proxyState.authCredentials.username && proxyState.authCredentials.password) {
            console.log('📤 Отправляем учетные данные:')
            console.log('   Логин:', proxyState.authCredentials.username)
            console.log('   Пароль:', proxyState.authCredentials.password)

            callback({
                authCredentials: {
                    username: proxyState.authCredentials.username,
                    password: proxyState.authCredentials.password,
                },
            })

            console.log('✅ Учетные данные отправлены')
        } else {
            console.log('❌ Нет учетных данных для авторизации')
            console.log('   isProxy:', details.isProxy)
            console.log('   Есть учетные данные:', !!proxyState.authCredentials)
            console.log('   Логин:', proxyState.authCredentials?.username || 'НЕТ')
            console.log('   Пароль:', proxyState.authCredentials?.password || 'НЕТ')
            callback({})
        }
    },
    { urls: ['<all_urls>'] },
    ['asyncBlocking']
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
        return {
            success: false,
            error: error.message || 'Ошибка открытия боковой панели',
        }
    }
}

// Уведомление об ошибке подключения
function notifyConnectionError(errorMessage) {
    chrome.runtime
        .sendMessage({
            action: 'proxyConnectionError',
            error: errorMessage,
            fatal: false,
        })
        .catch(() => {
            // Игнорируем, если нет получателей
        })
}

// Уведомление об ошибке
function notifyError(errorMessage) {
    chrome.runtime
        .sendMessage({
            action: 'proxyError',
            error: errorMessage,
        })
        .catch(() => {
            // Игнорируем, если нет получателей
        })
}

// Обработка сообщений от popup/sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'applyProxy':
            console.log('📨 Получен запрос на применение прокси:', request.profile)
            applyProxyProfile(request.profile)
                .then((result) => sendResponse(result))
                .catch((error) =>
                    sendResponse({
                        success: false,
                        error: error.message || 'Ошибка применения прокси',
                    })
                )
            return true

        case 'disableProxy':
            disableProxy()
                .then((result) => sendResponse(result))
                .catch((error) =>
                    sendResponse({
                        success: false,
                        error: error.message || 'Ошибка отключения прокси',
                    })
                )
            return true

        case 'getStatus':
            sendResponse(getStatus())
            break

        case 'getGeoLocation':
            getGeoLocation(request.ip)
                .then((result) => sendResponse({ success: true, data: result }))
                .catch((error) =>
                    sendResponse({
                        success: false,
                        error: error.message || 'Ошибка геолокации',
                    })
                )
            return true

        case 'openSidePanel':
            openSidePanel(request.windowId)
                .then((result) => sendResponse(result))
                .catch((error) =>
                    sendResponse({
                        success: false,
                        error: error.message || 'Ошибка открытия панели',
                    })
                )
            return true

        case 'resetAuth':
            if (proxyState.currentProxy && proxyState.authCredentials) {
                setupProxyAuthRules()
                    .then(() =>
                        sendResponse({
                            success: true,
                            message: 'Правила авторизации пересозданы',
                        })
                    )
                    .catch(() =>
                        sendResponse({
                            success: false,
                            error: 'Ошибка пересоздания правил',
                        })
                    )
            } else {
                sendResponse({
                    success: false,
                    error: 'Нет активного прокси',
                })
            }
            return true

        case 'debugAuth':
            chrome.declarativeNetRequest
                .getDynamicRules()
                .then((rules) => {
                    const ourRules = rules.filter((rule) => RULE_IDS.includes(rule.id))

                    const debugInfo = {
                        isActive: proxyState.isActive,
                        currentProfile: proxyState.currentProxy,
                        authCredentials: {
                            username: proxyState.authCredentials?.username || 'НЕТ',
                            password: proxyState.authCredentials?.password || 'НЕТ',
                        },
                        declarativeRulesCount: ourRules.length,
                        totalRulesCount: rules.length,
                        ruleIds: RULE_IDS,
                        ourRules: ourRules,
                    }

                    console.log('🔍 === ОТЛАДОЧНАЯ ИНФОРМАЦИЯ ===')
                    console.log(JSON.stringify(debugInfo, null, 2))

                    sendResponse({
                        success: true,
                        debug: debugInfo,
                    })
                })
                .catch((error) =>
                    sendResponse({
                        success: false,
                        error: error.message || 'Ошибка получения правил',
                    })
                )
            return true

        default:
            sendResponse({ success: false, error: 'Неизвестное действие' })
    }
})

// Обработка ошибок прокси
chrome.proxy.onProxyError.addListener((details) => {
    console.error('💥 Критическая ошибка прокси:', details)

    const errorMessage = details.error || 'Критическая ошибка прокси-сервера'
    notifyError(errorMessage)
})

console.log('🚀 Chrome Proxy Manager инициализирован')
console.log('🔐 Используется гибридный подход: declarativeNetRequest + onAuthRequired')
console.log('🆔 ID расширения:', EXTENSION_ID)
console.log('📝 Включен режим подробного логирования для отладки')
