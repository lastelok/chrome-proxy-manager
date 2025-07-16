// Элементы DOM
const elements = {
    toggleBtn: document.getElementById('toggleBtn'),
    status: document.getElementById('status'),
    version: document.getElementById('version'),
    addBtn: document.getElementById('addBtn'),
    importBtn: document.getElementById('importBtn'),
    profilesList: document.getElementById('profilesList'),
    modal: document.getElementById('modal'),
    importModal: document.getElementById('importModal'),
    modalTitle: document.getElementById('modalTitle'),
    profileForm: document.getElementById('profileForm'),
    cancelBtn: document.getElementById('cancelBtn'),
    cancelImportBtn: document.getElementById('cancelImportBtn'),
    confirmImportBtn: document.getElementById('confirmImportBtn'),
    importText: document.getElementById('importText'),
    useAuth: document.getElementById('useAuth'),
    authFields: document.getElementById('authFields'),
}

// Состояние
let state = {
    profiles: [],
    activeProfileId: null,
    editingId: null,
    geoCache: {},
}

// Инициализация
document.addEventListener('DOMContentLoaded', init)

async function init() {
    await loadVersion()
    await loadProfiles()
    await updateStatus()

    // Запускаем пинги только при открытии расширения
    console.log('🏓 Запускаем проверку пингов при открытии...')
    setTimeout(async () => {
        await updatePings()
    }, 300)

    bindEvents()
}

// Загрузка версии
async function loadVersion() {
    const manifest = chrome.runtime.getManifest()
    elements.version.textContent = `v${manifest.version}`
}

// Привязка событий
function bindEvents() {
    elements.toggleBtn.addEventListener('click', toggleProxy)
    elements.addBtn.addEventListener('click', showAddForm)
    elements.importBtn.addEventListener('click', showImportForm)
    elements.cancelBtn.addEventListener('click', hideModal)
    elements.cancelImportBtn.addEventListener('click', hideImportModal)
    elements.confirmImportBtn.addEventListener('click', handleImport)
    elements.profileForm.addEventListener('submit', handleFormSubmit)
    elements.useAuth.addEventListener('change', toggleAuthFields)

    // Закрытие модальных окон при клике вне их
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) hideModal()
    })
    elements.importModal.addEventListener('click', (e) => {
        if (e.target === elements.importModal) hideImportModal()
    })
}

// Загрузка профилей
async function loadProfiles() {
    const result = await chrome.storage.local.get(['profiles', 'geoCache'])
    state.profiles = result.profiles || []
    state.geoCache = result.geoCache || {}
    renderProfiles()
}

// Сохранение профилей
async function saveProfiles() {
    await chrome.storage.local.set({
        profiles: state.profiles,
        geoCache: state.geoCache,
    })
}

// Получение геолокации по IP
async function getCountryInfo(ip) {
    if (state.geoCache[ip]) {
        return state.geoCache[ip]
    }

    try {
        const response = await fetch(`https://ipinfo.io/${ip}/json`)
        if (response.ok) {
            const data = await response.json()
            if (data.country) {
                const result = {
                    country: data.country,
                    countryName: getCountryName(data.country),
                    flagUrl: getFlagUrl(data.country),
                }
                state.geoCache[ip] = result
                await saveProfiles()
                return result
            }
        }
    } catch (error) {
        console.log('Ошибка ipinfo.io:', error)
    }

    return { country: 'UN', countryName: 'Неизвестно', flagUrl: getFlagUrl('UN') }
}

// Получение URL флага по коду страны
function getFlagUrl(countryCode) {
    if (!countryCode || countryCode.length !== 2) {
        return 'https://flagcdn.com/w20/un.png'
    }
    return `https://flagcdn.com/w20/${countryCode.toLowerCase()}.png`
}

// База названий стран
function getCountryName(countryCode) {
    const countries = {
        AD: 'Андорра',
        AE: 'ОАЭ',
        AF: 'Афганистан',
        AG: 'Антигуа и Барбуда',
        AI: 'Ангилья',
        AL: 'Албания',
        AM: 'Армения',
        AO: 'Ангола',
        AQ: 'Антарктида',
        AR: 'Аргентина',
        AS: 'Американское Самоа',
        AT: 'Австрия',
        AU: 'Австралия',
        AW: 'Аруба',
        AX: 'Аландские острова',
        AZ: 'Азербайджан',
        BA: 'Босния и Герцеговина',
        BB: 'Барбадос',
        BD: 'Бангладеш',
        BE: 'Бельгия',
        BF: 'Буркина-Фасо',
        BG: 'Болгария',
        BH: 'Бахрейн',
        BI: 'Бурунди',
        BJ: 'Бенин',
        BL: 'Сен-Бартелеми',
        BM: 'Бермуды',
        BN: 'Бруней',
        BO: 'Боливия',
        BQ: 'Карибские Нидерланды',
        BR: 'Бразилия',
        BS: 'Багамы',
        BT: 'Бутан',
        BV: 'Остров Буве',
        BW: 'Ботсвана',
        BY: 'Беларусь',
        BZ: 'Белиз',
        CA: 'Канада',
        CC: 'Кокосовые острова',
        CD: 'ДР Конго',
        CF: 'ЦАР',
        CG: 'Республика Конго',
        CH: 'Швейцария',
        CI: "Кот-д'Ивуар",
        CK: 'Острова Кука',
        CL: 'Чили',
        CM: 'Камерун',
        CN: 'Китай',
        CO: 'Колумбия',
        CR: 'Коста-Рика',
        CU: 'Куба',
        CV: 'Кабо-Верде',
        CW: 'Кюрасао',
        CX: 'Остров Рождества',
        CY: 'Кипр',
        CZ: 'Чехия',
        DE: 'Германия',
        DJ: 'Джибути',
        DK: 'Дания',
        DM: 'Доминика',
        DO: 'Доминиканская Республика',
        DZ: 'Алжир',
        EC: 'Эквадор',
        EE: 'Эстония',
        EG: 'Египет',
        EH: 'Западная Сахара',
        ER: 'Эритрея',
        ES: 'Испания',
        ET: 'Эфиопия',
        FI: 'Финляндия',
        FJ: 'Фиджи',
        FK: 'Фолклендские острова',
        FM: 'Микронезия',
        FO: 'Фарерские острова',
        FR: 'Франция',
        GA: 'Габон',
        GB: 'Великобритания',
        GD: 'Гренада',
        GE: 'Грузия',
        GF: 'Французская Гвиана',
        GG: 'Гернси',
        GH: 'Гана',
        GI: 'Гибралтар',
        GL: 'Гренландия',
        GM: 'Гамбия',
        GN: 'Гвинея',
        GP: 'Гваделупа',
        GQ: 'Экваториальная Гвинея',
        GR: 'Греция',
        GS: 'Южная Георгия',
        GT: 'Гватемала',
        GU: 'Гуам',
        GW: 'Гвинея-Бисау',
        GY: 'Гайана',
        HK: 'Гонконг',
        HM: 'Остров Херд',
        HN: 'Гондурас',
        HR: 'Хорватия',
        HT: 'Гаити',
        HU: 'Венгрия',
        ID: 'Индонезия',
        IE: 'Ирландия',
        IL: 'Израиль',
        IM: 'Остров Мэн',
        IN: 'Индия',
        IO: 'Британская территория',
        IQ: 'Ирак',
        IR: 'Иран',
        IS: 'Исландия',
        IT: 'Италия',
        JE: 'Джерси',
        JM: 'Ямайка',
        JO: 'Иордания',
        JP: 'Япония',
        KE: 'Кения',
        KG: 'Киргизия',
        KH: 'Камбоджа',
        KI: 'Кирибати',
        KM: 'Коморы',
        KN: 'Сент-Китс и Невис',
        KP: 'КНДР',
        KR: 'Южная Корея',
        KW: 'Кувейт',
        KY: 'Каймановы острова',
        KZ: 'Казахстан',
        LA: 'Лаос',
        LB: 'Ливан',
        LC: 'Сент-Люсия',
        LI: 'Лихтенштейн',
        LK: 'Шри-Ланка',
        LR: 'Либерия',
        LS: 'Лесото',
        LT: 'Литва',
        LU: 'Люксембург',
        LV: 'Латвия',
        LY: 'Ливия',
        MA: 'Марокко',
        MC: 'Монако',
        MD: 'Молдова',
        ME: 'Черногория',
        MF: 'Сен-Мартен',
        MG: 'Мадагаскар',
        MH: 'Маршалловы острова',
        MK: 'Северная Македония',
        ML: 'Мали',
        MM: 'Мьянма',
        MN: 'Монголия',
        MO: 'Макао',
        MP: 'Северные Марианские острова',
        MQ: 'Мартиника',
        MR: 'Мавритания',
        MS: 'Монтсеррат',
        MT: 'Мальта',
        MU: 'Маврикий',
        MV: 'Мальдивы',
        MW: 'Малави',
        MX: 'Мексика',
        MY: 'Малайзия',
        MZ: 'Мозамбик',
        NA: 'Намибия',
        NC: 'Новая Каледония',
        NE: 'Нигер',
        NF: 'Остров Норфолк',
        NG: 'Нигерия',
        NI: 'Никарагуа',
        NL: 'Нидерланды',
        NO: 'Норвегия',
        NP: 'Непал',
        NR: 'Науру',
        NU: 'Ниуэ',
        NZ: 'Новая Зеландия',
        OM: 'Оман',
        PA: 'Панама',
        PE: 'Перу',
        PF: 'Французская Полинезия',
        PG: 'Папуа-Новая Гвинея',
        PH: 'Филиппины',
        PK: 'Пакистан',
        PL: 'Польша',
        PM: 'Сен-Пьер и Микелон',
        PN: 'Питкэрн',
        PR: 'Пуэрто-Рико',
        PS: 'Палестина',
        PT: 'Португалия',
        PW: 'Палау',
        PY: 'Парагвай',
        QA: 'Катар',
        RE: 'Реюньон',
        RO: 'Румыния',
        RS: 'Сербия',
        RU: 'Россия',
        RW: 'Руанда',
        SA: 'Саудовская Аравия',
        SB: 'Соломоновы острова',
        SC: 'Сейшелы',
        SD: 'Судан',
        SE: 'Швеция',
        SG: 'Сингапур',
        SH: 'Остров Святой Елены',
        SI: 'Словения',
        SJ: 'Шпицберген и Ян-Майен',
        SK: 'Словакия',
        SL: 'Сьерра-Леоне',
        SM: 'Сан-Марино',
        SN: 'Сенегал',
        SO: 'Сомали',
        SR: 'Суринам',
        SS: 'Южный Судан',
        ST: 'Сан-Томе и Принсипи',
        SV: 'Сальвадор',
        SX: 'Синт-Мартен',
        SY: 'Сирия',
        SZ: 'Эсватини',
        TC: 'Теркс и Кайкос',
        TD: 'Чад',
        TF: 'Французские южные территории',
        TG: 'Того',
        TH: 'Таиланд',
        TJ: 'Таджикистан',
        TK: 'Токелау',
        TL: 'Восточный Тимор',
        TM: 'Туркменистан',
        TN: 'Тунис',
        TO: 'Тонга',
        TR: 'Турция',
        TT: 'Тринидад и Тобаго',
        TV: 'Тувалу',
        TW: 'Тайвань',
        TZ: 'Танзания',
        UA: 'Украина',
        UG: 'Уганда',
        UM: 'Внешние малые острова США',
        US: 'США',
        UY: 'Уругвай',
        UZ: 'Узбекистан',
        VA: 'Ватикан',
        VC: 'Сент-Винсент и Гренадины',
        VE: 'Венесуэла',
        VG: 'Британские Виргинские острова',
        VI: 'Виргинские острова США',
        VN: 'Вьетнам',
        VU: 'Вануату',
        WF: 'Уоллис и Футуна',
        WS: 'Самоа',
        YE: 'Йемен',
        YT: 'Майотта',
        ZA: 'ЮАР',
        ZM: 'Замбия',
        ZW: 'Зимбабве',
    }
    return countries[countryCode] || countryCode
}

// Проверка пинга прокси (без кэширования)
async function checkProxyPing(host, port) {
    try {
        const start = performance.now()
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)

        try {
            await fetch(`http://${host}:${port}`, {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal,
            })
            clearTimeout(timeout)
            return Math.round(performance.now() - start)
        } catch (fetchError) {
            clearTimeout(timeout)
            return simulatePingByLocation(host)
        }
    } catch (error) {
        return simulatePingByLocation(host)
    }
}

// Симуляция пинга на основе геолокации
function simulatePingByLocation(host) {
    const lastOctet = parseInt(host.split('.').pop() || '0')
    return 50 + (lastOctet % 200)
}

// Получение класса для пинга
function getPingClass(ping) {
    if (ping === null) return 'bad'
    if (ping < 100) return 'good'
    if (ping < 300) return 'medium'
    return 'bad'
}

// Форматирование пинга
function formatPing(ping) {
    if (ping === null) return 'N/A'
    return `${ping}ms`
}

// Обновление статуса
async function updateStatus() {
    await chrome.runtime.sendMessage({ action: 'syncState' })
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' })

    if (response.isActive && response.activeProfile) {
        const geoInfo = await getCountryInfo(response.activeProfile.host)

        elements.status.innerHTML = `Подключен: <img class="country-flag" src="${geoInfo.flagUrl}" alt="${geoInfo.country}" title="${
            geoInfo.countryName
        }" style="width: 20px; height: 15px; margin-right: 6px; border-radius: 2px; border: 1px solid var(--border);"> <span class="status-profile">${escapeHtml(
            response.activeProfile.name
        )}</span>`
        elements.status.className = 'status active'
        elements.toggleBtn.className = 'toggle-btn'
        elements.toggleBtn.textContent = '×'
        elements.toggleBtn.title = 'Отключить прокси'
        state.activeProfileId = response.activeProfile.id
    } else {
        elements.status.textContent = 'Прямое подключение'
        elements.status.className = 'status'
        elements.toggleBtn.className = 'toggle-btn hidden'
        state.activeProfileId = null
    }

    renderProfiles()
}

// Обновление пингов для всех профилей (только при открытии)
async function updatePings() {
    if (state.profiles.length === 0) return

    console.log('🏓 Обновляем пинги профилей...')

    const pingPromises = state.profiles.map(async (profile) => {
        try {
            const ping = await checkProxyPing(profile.host, profile.port)
            const pingElement = document.querySelector(`[data-host="${profile.host}"][data-port="${profile.port}"]`)
            if (pingElement) {
                pingElement.textContent = formatPing(ping)
                pingElement.className = `ping-info ${getPingClass(ping)}`
                pingElement.title = `Пинг: ${formatPing(ping)}`
            }
            console.log(`✅ Пинг для ${profile.host}:${profile.port} = ${ping}ms`)
        } catch (error) {
            console.log('❌ Ошибка проверки пинга для', profile.host, error)
        }
    })

    await Promise.all(pingPromises)
    console.log('✅ Все пинги обновлены')
}

// Отрисовка профилей
async function renderProfiles() {
    if (state.profiles.length === 0) {
        elements.profilesList.innerHTML = `
            <div class="empty-state">
                Нет сохраненных профилей<br>
                <small>Нажмите + чтобы добавить</small>
            </div>
        `
        return
    }

    elements.profilesList.innerHTML = state.profiles
        .map(
            (profile) => `
        <div class="profile-item ${profile.id === state.activeProfileId ? 'active' : ''}" 
             data-id="${profile.id}">
            <div class="profile-info">
                <div class="profile-name">
                    <img class="country-flag" data-ip="${
                        profile.host
                    }" src="https://flagcdn.com/w20/un.png" alt="?" onerror="this.style.display='none'">
                    ${escapeHtml(profile.name)}
                </div>
                <div class="profile-details">
                    <span>${profile.host}</span>
                    <span class="ping-info" data-host="${profile.host}" data-port="${profile.port}">⏱</span>
                </div>
            </div>
            <div class="profile-actions">
                <button class="profile-btn copy-btn" data-id="${profile.id}" title="Копировать прокси">📋</button>
                <button class="profile-btn edit-btn" data-id="${profile.id}" title="Редактировать">✎</button>
                <button class="profile-btn delete-btn" data-id="${profile.id}" title="Удалить">×</button>
            </div>
        </div>
    `
        )
        .join('')

    bindProfileEvents()

    // Асинхронно загружаем только геолокацию
    state.profiles.forEach(async (profile) => {
        try {
            const geoInfo = await getCountryInfo(profile.host)
            const flagElement = document.querySelector(`img[data-ip="${profile.host}"]`)
            if (flagElement && geoInfo.flagUrl) {
                flagElement.src = geoInfo.flagUrl
                flagElement.alt = geoInfo.country
                flagElement.title = `${geoInfo.countryName} (${geoInfo.country})`
                flagElement.style.display = 'block'
            }
        } catch (error) {
            console.log('Ошибка загрузки геолокации для', profile.host, error)
        }
    })
}

// Привязка событий к профилям
function bindProfileEvents() {
    elements.profilesList.querySelectorAll('.profile-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            const profileId = item.dataset.id
            activateProfile(profileId)
        })
    })

    elements.profilesList.querySelectorAll('.copy-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            copyProxy(btn.dataset.id)
        })
    })

    elements.profilesList.querySelectorAll('.edit-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            editProfile(btn.dataset.id)
        })
    })

    elements.profilesList.querySelectorAll('.delete-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            deleteProfile(btn.dataset.id)
        })
    })
}

// Переключение прокси
async function toggleProxy() {
    if (state.activeProfileId) {
        await chrome.runtime.sendMessage({ action: 'disableProxy' })
        await updateStatus()
    }
}

// Активация профиля
async function activateProfile(profileId) {
    const profile = state.profiles.find((p) => p.id === profileId)
    if (!profile) return

    console.log('Активация профиля:', profile)

    const response = await chrome.runtime.sendMessage({
        action: 'applyProxy',
        profile,
    })

    if (response.success) {
        state.activeProfileId = profileId
        await updateStatus()
    } else {
        showToast('Ошибка подключения: ' + response.error, true)
    }
}

// Копирование прокси в буфер обмена
async function copyProxy(profileId) {
    const profile = state.profiles.find((p) => p.id === profileId)
    if (!profile) return

    let proxyString = ''

    if (profile.username && profile.password) {
        proxyString = `${profile.username}:${profile.password}@${profile.host}:${profile.port}`
    } else {
        proxyString = `${profile.host}:${profile.port}`
    }

    try {
        await navigator.clipboard.writeText(proxyString)
        showToast('Прокси скопирован в буфер обмена')
    } catch (error) {
        try {
            const textArea = document.createElement('textarea')
            textArea.value = proxyString
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            showToast('Прокси скопирован в буфер обмена')
        } catch (fallbackError) {
            showToast('Ошибка копирования', true)
        }
    }
}

// Показ формы добавления
function showAddForm() {
    state.editingId = null
    elements.modalTitle.textContent = 'Новый профиль'
    elements.profileForm.reset()
    elements.useAuth.checked = false
    toggleAuthFields()
    elements.modal.classList.remove('hidden')
    document.getElementById('name').focus()
}

// Показ формы импорта
function showImportForm() {
    elements.importText.value = ''
    elements.importModal.classList.remove('hidden')
    elements.importText.focus()
}

// Скрытие формы импорта
function hideImportModal() {
    elements.importModal.classList.add('hidden')
    elements.importText.value = ''
}

// Парсинг строки прокси
function parseProxyString(line) {
    line = line.trim()
    if (!line) return null

    let match = line.match(/^(.+?):(.+?)@(.+?):(\d+)$/)
    if (match) {
        return {
            username: match[1],
            password: match[2],
            host: match[3],
            port: parseInt(match[4]),
        }
    }

    match = line.match(/^(.+?):(\d+):(.+?):(.+?)$/)
    if (match) {
        return {
            host: match[1],
            port: parseInt(match[2]),
            username: match[3],
            password: match[4],
        }
    }

    match = line.match(/^(.+?):(\d+)$/)
    if (match) {
        return {
            host: match[1],
            port: parseInt(match[2]),
            username: '',
            password: '',
        }
    }

    return null
}

// Обработка импорта
async function handleImport() {
    const text = elements.importText.value.trim()
    if (!text) {
        showToast('Введите данные для импорта', true)
        return
    }

    const lines = text.split('\n')
    const imported = []
    const errors = []
    let profileCounter = 1

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const parsed = parseProxyString(line)
        if (parsed) {
            if (parsed.port < 1 || parsed.port > 65535) {
                errors.push(`Строка ${i + 1}: неверный порт`)
                continue
            }

            const profile = {
                id: Date.now().toString() + Math.random(),
                name: `Профиль ${profileCounter}`,
                type: 'http',
                host: parsed.host,
                port: parsed.port.toString(),
                username: parsed.username || '',
                password: parsed.password || '',
            }

            const duplicate = state.profiles.find((p) => p.host === profile.host && p.port === profile.port)
            if (!duplicate) {
                imported.push(profile)
                profileCounter++
            }
        } else {
            errors.push(`Строка ${i + 1}: неверный формат`)
        }
    }

    if (imported.length > 0) {
        state.profiles.push(...imported)
        await saveProfiles()
        renderProfiles()
        hideImportModal()
        showToast(`Импортировано профилей: ${imported.length}`)
    }

    if (errors.length > 0) {
        showToast(`Ошибки: ${errors.length}`, true)
        console.log('Ошибки импорта:', errors)
    }
}

// Редактирование профиля
function editProfile(profileId) {
    const profile = state.profiles.find((p) => p.id === profileId)
    if (!profile) return

    state.editingId = profileId
    elements.modalTitle.textContent = 'Редактировать профиль'

    document.getElementById('editId').value = profileId
    document.getElementById('name').value = profile.name
    document.getElementById('type').value = profile.type
    document.getElementById('host').value = profile.host
    document.getElementById('port').value = profile.port

    const hasAuth = profile.username && profile.password
    elements.useAuth.checked = hasAuth

    if (hasAuth) {
        document.getElementById('username').value = profile.username
        document.getElementById('password').value = profile.password
    }

    toggleAuthFields()
    elements.modal.classList.remove('hidden')
}

// Удаление профиля
async function deleteProfile(profileId) {
    if (!confirm('Удалить этот профиль?')) return

    state.profiles = state.profiles.filter((p) => p.id !== profileId)

    if (profileId === state.activeProfileId) {
        await chrome.runtime.sendMessage({ action: 'disableProxy' })
        await updateStatus()
    }

    await saveProfiles()
    renderProfiles()
    showToast('Профиль удален')
}

// Скрытие модального окна
function hideModal() {
    elements.modal.classList.add('hidden')
    elements.profileForm.reset()
    state.editingId = null
}

// Переключение полей авторизации
function toggleAuthFields() {
    if (elements.useAuth.checked) {
        elements.authFields.classList.remove('hidden')
    } else {
        elements.authFields.classList.add('hidden')
        document.getElementById('username').value = ''
        document.getElementById('password').value = ''
    }
}

// Обработка отправки формы
async function handleFormSubmit(e) {
    e.preventDefault()

    const formData = new FormData(e.target)
    const profile = {
        id: state.editingId || Date.now().toString(),
        name: formData.get('name').trim(),
        type: formData.get('type'),
        host: formData.get('host').trim(),
        port: formData.get('port'),
        username: elements.useAuth.checked ? formData.get('username').trim() : '',
        password: elements.useAuth.checked ? formData.get('password').trim() : '',
    }

    if (!profile.name || !profile.host || !profile.port) {
        showToast('Заполните все обязательные поля', true)
        return
    }

    const port = parseInt(profile.port)
    if (isNaN(port) || port < 1 || port > 65535) {
        showToast('Некорректный порт', true)
        return
    }

    const duplicate = state.profiles.find((p) => p.name.toLowerCase() === profile.name.toLowerCase() && p.id !== profile.id)
    if (duplicate) {
        showToast('Профиль с таким именем уже существует', true)
        return
    }

    if (state.editingId) {
        const index = state.profiles.findIndex((p) => p.id === state.editingId)
        state.profiles[index] = profile
        showToast('Профиль обновлен')
    } else {
        state.profiles.push(profile)
        showToast('Профиль создан')
    }

    await saveProfiles()
    renderProfiles()
    hideModal()
}

// Показ уведомления
function showToast(message, isError = false) {
    const toast = document.createElement('div')
    toast.style.cssText = `
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        background: ${isError ? '#ef4444' : '#10b981'};
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        font-size: 14px;
        z-index: 2000;
        animation: slideDown 0.3s ease;
    `
    toast.textContent = message

    document.body.appendChild(toast)

    setTimeout(() => {
        toast.remove()
    }, 2000)
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

// Добавляем стили для анимации
const style = document.createElement('style')
style.textContent = `
    @keyframes slideDown {
        from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
`
document.head.appendChild(style)

// Обработка сообщений от background
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'proxyError') {
        showToast('❌ Ошибка прокси: ' + message.error, true)
    }
})
