// Состояние прокси
let proxyState = {
    currentProxy: null,
    authCredentials: null,
    isActive: false,
}

// Кеш геолокации
let geoCache = new Map()

// ID правил для declarativeNetRequest (используем уникальные ID)
const RULE_IDS = [1001, 1002, 1003, 1004, 1005]

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
        // Очищаем старые правила при инициализации
        await clearProxyAuthRules()

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
        console.error('Ошибка инициализации:', error.message || error)
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

// ИСПРАВЛЕННАЯ функция: Настройка правил авторизации через declarativeNetRequest
async function setupProxyAuthRules() {
    try {
        console.log('🔧 Начинаем настройку правил авторизации...')

        // Сначала ОБЯЗАТЕЛЬНО очищаем все старые правила
        await clearProxyAuthRules()

        if (!proxyState.authCredentials || !proxyState.authCredentials.username || !proxyState.authCredentials.password) {
            console.log('🔐 Нет учетных данных для настройки авторизации')
            return
        }

        const credentials = btoa(`${proxyState.authCredentials.username}:${proxyState.authCredentials.password}`)
        console.log('🔑 Создаем Base64 авторизацию:', `Basic ${credentials.substring(0, 10)}...`)

        // Создаем правила для разных типов запросов с ПРАВИЛЬНЫМИ типами ресурсов
        const rules = [
            {
                id: RULE_IDS[0], // 1001
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
                    resourceTypes: ['main_frame', 'sub_frame'],
                },
            },
            {
                id: RULE_IDS[1], // 1002
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
                    resourceTypes: ['xmlhttprequest'],
                },
            },
            {
                id: RULE_IDS[2], // 1003
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
                    resourceTypes: ['script', 'stylesheet'],
                },
            },
            {
                id: RULE_IDS[3], // 1004
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
                    resourceTypes: ['image', 'media', 'font'],
                },
            },
            {
                id: RULE_IDS[4], // 1005
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
                    resourceTypes: ['other', 'websocket', 'object', 'ping'],
                },
            },
        ]

        console.log('📝 Добавляем правила с ID:', RULE_IDS)

        // Применяем правила
        await chrome.declarativeNetRequest.updateDynamicRules({
            addRules: rules,
        })

        // Проверяем, что правила действительно добавлены
        const activeRules = await chrome.declarativeNetRequest.getDynamicRules()
        const ourRules = activeRules.filter((rule) => RULE_IDS.includes(rule.id))

        console.log('✅ Успешно добавлено правил авторизации:', ourRules.length)
        console.log('🔐 Заголовки Proxy-Authorization будут добавляться автоматически ко всем запросам')

        if (ourRules.length !== RULE_IDS.length) {
            throw new Error(`Добавлено только ${ourRules.length} из ${RULE_IDS.length} правил`)
        }
    } catch (error) {
        console.error('❌ Ошибка настройки правил авторизации:', error.message || error)

        // Пытаемся диагностировать проблему
        try {
            const existingRules = await chrome.declarativeNetRequest.getDynamicRules()
            console.log(
                '🔍 Существующие правила:',
                existingRules.map((r) => r.id)
            )
        } catch (diagError) {
            console.error('Ошибка диагностики:', diagError.message || diagError)
        }
    }
}

// Очистка правил авторизации
async function clearProxyAuthRules() {
    try {
        console.log('🧹 Очищаем правила авторизации...')

        // Получаем все существующие правила
        const existingRules = await chrome.declarativeNetRequest.getDynamicRules()

        // Ищем наши правила по ID
        const ourRuleIds = existingRules.filter((rule) => RULE_IDS.includes(rule.id)).map((rule) => rule.id)

        if (ourRuleIds.length > 0) {
            await chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: ourRuleIds,
            })
            console.log('🗑️ Удалены правила с ID:', ourRuleIds)
        } else {
            console.log('📝 Наших правил не найдено')
        }

        // Дополнительно очищаем все возможные ID на всякий случай
        await chrome.declarativeNetRequest
            .updateDynamicRules({
                removeRuleIds: RULE_IDS,
            })
            .catch(() => {
                // Игнорируем ошибки, если правила уже не существуют
            })
    } catch (error) {
        console.error('Ошибка очистки правил авторизации:', error.message || error)
    }
}

// Применение настроек прокси
async function applyProxyProfile(profile) {
    try {
        if (!profile || !profile.host || !profile.port) {
            throw new Error('Некорректные данные профиля')
        }

        console.log('🔄 Применяем профиль прокси:', profile.name)

        // Очищаем любые предыдущие настройки прокси и правила авторизации
        await chrome.proxy.settings.clear({})
        await clearProxyAuthRules()

        // Небольшая задержка для очистки
        await new Promise((resolve) => setTimeout(resolve, 200))

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
            profileName: profile.name,
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

        // Применяем настройки прокси
        await chrome.proxy.settings.set({
            value: proxyConfig,
            scope: 'regular',
        })

        // КЛЮЧЕВОЙ МОМЕНТ: Настраиваем авторизацию ПОСЛЕ применения прокси
        if (profile.username && profile.password) {
            console.log('🔐 Настраиваем авторизацию для пользователя:', profile.username)
            await setupProxyAuthRules()
        } else {
            console.log('📝 Прокси без авторизации')
        }

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
        console.log('🔐 Авторизация настроена через declarativeNetRequest')

        return { success: true }
    } catch (error) {
        console.error('❌ Ошибка применения прокси:', error.message || error)
        notifyError(error.message || 'Неизвестная ошибка при применении прокси')
        return { success: false, error: error.message || 'Неизвестная ошибка' }
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
        console.error('❌ Ошибка отключения прокси:', error.message || error)
        notifyError(error.message || 'Ошибка отключения прокси')
        return { success: false, error: error.message || 'Ошибка отключения прокси' }
    }
}

// Дополнительный перехватчик для fetch API (резервный метод)
const originalFetch = globalThis.fetch
globalThis.fetch = async function (input, init = {}) {
    // Если есть активный прокси с авторизацией, добавляем заголовок (дублирование для надежности)
    if (proxyState.authCredentials && proxyState.authCredentials.username && proxyState.authCredentials.password) {
        const headers = new Headers(init.headers || {})

        if (!headers.has('Proxy-Authorization')) {
            const credentials = btoa(`${proxyState.authCredentials.username}:${proxyState.authCredentials.password}`)
            headers.set('Proxy-Authorization', `Basic ${credentials}`)
            init.headers = headers
            console.log('🔐 [FETCH] Добавлен заголовок Proxy-Authorization')
        }
    }

    try {
        return await originalFetch.call(this, input, init)
    } catch (error) {
        // Обработка ошибок авторизации прокси
        if (error.message && (error.message.includes('ERR_PROXY_AUTH') || error.message.includes('407'))) {
            console.error('❌ Ошибка авторизации прокси в fetch:', error.message)
        }
        throw error
    }
}

// Отслеживание ошибок сети для диагностики
chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
        if (
            proxyState.isActive &&
            details.error &&
            (details.error.includes('PROXY') || details.error.includes('ERR_PROXY') || details.error.includes('407'))
        ) {
            console.error('🚫 Ошибка прокси:', {
                url: details.url.substring(0, 100),
                error: details.error,
                tabId: details.tabId,
            })

            // Если это ошибка авторизации - это означает, что наши правила не сработали
            if (details.error.includes('ERR_PROXY_AUTH') || details.error.includes('407')) {
                console.error('❌ КРИТИЧНО: Ошибка авторизации прокси! Правила declarativeNetRequest не работают')

                // Пытаемся пересоздать правила
                setTimeout(() => {
                    console.log('🔄 Попытка восстановления правил авторизации...')
                    setupProxyAuthRules()
                }, 2000)

                chrome.runtime
                    .sendMessage({
                        action: 'proxyAuthError',
                        error: 'Ошибка авторизации прокси. Попытка восстановления...',
                    })
                    .catch(() => {})
            } else {
                // Другие ошибки прокси
                chrome.runtime
                    .sendMessage({
                        action: 'proxyConnectionError',
                        error: `Ошибка соединения: ${details.error}`,
                        fatal: false,
                    })
                    .catch(() => {})
            }
        }
    },
    { urls: ['<all_urls>'] }
)

// БЛОКИРУЕМ onAuthRequired полностью - если он срабатывает, значит наши правила не работают
chrome.webRequest.onAuthRequired.addListener(
    (details) => {
        if (details.isProxy) {
            console.error('💥 КРИТИЧНО: Появился запрос авторизации! Правила declarativeNetRequest НЕ РАБОТАЮТ!')
            console.error('🔍 Детали запроса:', {
                url: details.url.substring(0, 100),
                challenger: details.challenger,
                isProxy: details.isProxy,
            })

            // Немедленно уведомляем пользователя
            notifyError('Правила авторизации не работают. Проверьте поддержку declarativeNetRequest.')

            // Пытаемся восстановить правила
            setTimeout(() => {
                console.log('🔄 Экстренная попытка восстановления правил авторизации...')
                setupProxyAuthRules()
            }, 1000)
        }
    },
    { urls: ['<all_urls>'] }
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
        console.error('Ошибка открытия боковой панели:', error.message || error)
        return { success: false, error: error.message || 'Ошибка открытия боковой панели' }
    }
}

// Уведомление об ошибке (ИСПРАВЛЕНО: правильный вывод ошибок)
function notifyError(errorMessage) {
    const message = typeof errorMessage === 'string' ? errorMessage : errorMessage?.message || 'Неизвестная ошибка'

    chrome.runtime
        .sendMessage({
            action: 'proxyError',
            error: message,
        })
        .catch(() => {
            // Игнорируем ошибку, если нет получателей
        })
}

// Функция для принудительного пересоздания правил авторизации
function resetAuthAttempts() {
    console.log('🔄 Пересоздание правил авторизации')

    // Пересоздаем правила авторизации
    if (proxyState.currentProxy && proxyState.authCredentials) {
        setupProxyAuthRules()
    }
}

// Обработка сообщений от popup/sidepanel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'applyProxy':
            applyProxyProfile(request.profile)
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ success: false, error: error.message || 'Ошибка применения прокси' }))
            return true

        case 'disableProxy':
            disableProxy()
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ success: false, error: error.message || 'Ошибка отключения прокси' }))
            return true

        case 'getStatus':
            sendResponse(getStatus())
            break

        case 'getGeoLocation':
            getGeoLocation(request.ip)
                .then((result) => sendResponse({ success: true, data: result }))
                .catch((error) => sendResponse({ success: false, error: error.message || 'Ошибка геолокации' }))
            return true

        case 'openSidePanel':
            openSidePanel(request.windowId)
                .then((result) => sendResponse(result))
                .catch((error) => sendResponse({ success: false, error: error.message || 'Ошибка открытия панели' }))
            return true

        case 'resetAuth':
            resetAuthAttempts()
            sendResponse({ success: true, message: 'Правила авторизации пересозданы' })
            break

        case 'debugAuth':
            // Получаем информацию о текущих правилах
            chrome.declarativeNetRequest
                .getDynamicRules()
                .then((rules) => {
                    const ourRules = rules.filter((rule) => RULE_IDS.includes(rule.id))

                    console.log('🔍 === ОТЛАДОЧНАЯ ИНФОРМАЦИЯ ===')
                    console.log('🔀 Активен ли прокси:', proxyState.isActive)
                    console.log('📋 Текущий профиль:', proxyState.currentProxy)
                    console.log('🔐 Учетные данные:', {
                        username: proxyState.authCredentials?.username || 'НЕ ЗАДАН',
                        password: proxyState.authCredentials?.password ? 'ЗАДАН' : 'НЕ ЗАДАН',
                        fullObject: proxyState.authCredentials,
                    })
                    console.log('📜 Правила declarativeNetRequest (наши):', ourRules.length)
                    console.log('📜 Все правила declarativeNetRequest:', rules.length)
                    console.log('🔧 Детали наших правил:', ourRules)
                    console.log('🆔 Используемые ID:', RULE_IDS)
                    console.log('================================')

                    sendResponse({
                        success: true,
                        debug: {
                            isActive: proxyState.isActive,
                            currentProfile: proxyState.currentProxy,
                            authCredentials: proxyState.authCredentials,
                            declarativeRulesCount: ourRules.length,
                            totalRulesCount: rules.length,
                            ruleIds: RULE_IDS,
                            manifestVersion: 3,
                            authMethod: 'declarativeNetRequest (превентивный)',
                        },
                    })
                })
                .catch((error) => {
                    sendResponse({
                        success: false,
                        error: error.message || 'Ошибка получения правил',
                    })
                })
            return true

        default:
            sendResponse({ success: false, error: 'Неизвестное действие' })
    }
})

// Обработка ошибок прокси (ИСПРАВЛЕНО: правильный вывод ошибок)
chrome.proxy.onProxyError.addListener((details) => {
    console.error('💥 Ошибка прокси:', {
        error: details.error,
        details: details.details,
        fatal: details.fatal,
    })

    if (details.fatal) {
        const errorMessage = details.error || 'Критическая ошибка прокси-сервера'
        notifyError(errorMessage)

        chrome.runtime
            .sendMessage({
                action: 'proxyConnectionError',
                error: errorMessage,
                fatal: details.fatal,
            })
            .catch(() => {})
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
        clearProxyAuthRules()
        updateBadge(false)

        chrome.storage.local.remove(['activeProfile', 'activeProfileId']).catch((err) => console.error('Ошибка очистки данных:', err.message || err))
    } else if (isProxyActive && !proxyState.currentProxy) {
        // Прокси включен извне
        console.log('🔗 Прокси включен извне')
        proxyState.isActive = true
        updateBadge(true)
    }
})

console.log('🚀 Chrome Proxy Manager инициализирован для Manifest V3')
console.log('🔐 Используется declarativeNetRequest для ПРЕВЕНТИВНОЙ авторизации')
console.log('🆔 Используются уникальные ID правил:', RULE_IDS)
console.log('✨ Заголовки Proxy-Authorization добавляются ДО отправки запросов')
console.log('🚫 Диалоги авторизации должны полностью исчезнуть!')
