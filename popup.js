// Элементы DOM
const elements = {
    toggleBtn: document.getElementById('toggleBtn'),
    status: document.getElementById('status'),
    addBtn: document.getElementById('addBtn'),
    profilesList: document.getElementById('profilesList'),
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modalTitle'),
    profileForm: document.getElementById('profileForm'),
    cancelBtn: document.getElementById('cancelBtn'),
    useAuth: document.getElementById('useAuth'),
    authFields: document.getElementById('authFields'),
}

// Состояние
let state = {
    profiles: [],
    activeProfileId: null,
    editingId: null,
}

// Инициализация
document.addEventListener('DOMContentLoaded', init)

async function init() {
    await loadProfiles()
    await updateStatus()
    bindEvents()
}

// Привязка событий
function bindEvents() {
    elements.toggleBtn.addEventListener('click', toggleProxy)
    elements.addBtn.addEventListener('click', showAddForm)
    elements.cancelBtn.addEventListener('click', hideModal)
    elements.profileForm.addEventListener('submit', handleFormSubmit)
    elements.useAuth.addEventListener('change', toggleAuthFields)

    // Закрытие модального окна при клике вне его
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) hideModal()
    })
}

// Загрузка профилей
async function loadProfiles() {
    const result = await chrome.storage.local.get(['profiles'])
    state.profiles = result.profiles || []
    renderProfiles()
}

// Сохранение профилей
async function saveProfiles() {
    await chrome.storage.local.set({ profiles: state.profiles })
}

// Обновление статуса
async function updateStatus() {
    const response = await chrome.runtime.sendMessage({ action: 'getStatus' })

    if (response.isActive && response.activeProfile) {
        elements.status.textContent = `Подключен: ${response.activeProfile.name}`
        elements.status.className = 'status active'
        elements.toggleBtn.className = 'toggle-btn active'
        elements.toggleBtn.textContent = '●'
        state.activeProfileId = response.activeProfile.id
    } else {
        elements.status.textContent = 'Прямое подключение'
        elements.status.className = 'status'
        elements.toggleBtn.className = 'toggle-btn'
        elements.toggleBtn.textContent = '○'
        state.activeProfileId = null
    }

    renderProfiles()
}

// Отрисовка профилей
function renderProfiles() {
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
                <div class="profile-name">${escapeHtml(profile.name)}</div>
                <div class="profile-details">
                    ${profile.type.toUpperCase()} ${profile.host}:${profile.port}
                    ${profile.username ? '🔐' : ''}
                </div>
            </div>
            <div class="profile-actions">
                <button class="profile-btn edit-btn" data-id="${profile.id}" title="Редактировать">✎</button>
                <button class="profile-btn delete-btn" data-id="${profile.id}" title="Удалить">×</button>
            </div>
        </div>
    `
        )
        .join('')

    // Привязываем события к профилям
    bindProfileEvents()
}

// Привязка событий к профилям
function bindProfileEvents() {
    // Клик по профилю - активация
    elements.profilesList.querySelectorAll('.profile-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.profile-actions')) return
            const profileId = item.dataset.id
            activateProfile(profileId)
        })
    })

    // Кнопки редактирования
    elements.profilesList.querySelectorAll('.edit-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            editProfile(btn.dataset.id)
        })
    })

    // Кнопки удаления
    elements.profilesList.querySelectorAll('.delete-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            deleteProfile(btn.dataset.id)
        })
    })
}

// Сброс авторизации
async function resetAuth() {
    console.log('Сброс авторизации...')

    const response = await chrome.runtime.sendMessage({ action: 'resetAuth' })

    if (response.success) {
        showToast('Авторизация сброшена. Перезагрузите страницу.')
        console.log('✅ Авторизация успешно сброшена')
    } else {
        showToast('Ошибка сброса: ' + response.error, true)
        console.error('❌ Ошибка сброса авторизации:', response.error)
    }
}

// Переключение прокси
async function toggleProxy() {
    if (state.activeProfileId) {
        // Отключаем прокси
        await chrome.runtime.sendMessage({ action: 'disableProxy' })
    } else if (state.profiles.length > 0) {
        // Активируем первый профиль
        activateProfile(state.profiles[0].id)
    } else {
        // Показываем форму добавления
        showAddForm()
    }

    await updateStatus()
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

        if (profile.username && profile.password) {
            showToast('Прокси подключен с авторизацией. Если появится диалог входа - нажмите 🔄')
        } else {
            showToast('Прокси подключен')
        }
    } else {
        showToast('Ошибка подключения: ' + response.error, true)
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

    // Если удаляем активный профиль - отключаем прокси
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

    // Валидация
    if (!profile.name || !profile.host || !profile.port) {
        showToast('Заполните все обязательные поля', true)
        return
    }

    const port = parseInt(profile.port)
    if (isNaN(port) || port < 1 || port > 65535) {
        showToast('Некорректный порт', true)
        return
    }

    // Проверка дублирования имени
    const duplicate = state.profiles.find((p) => p.name.toLowerCase() === profile.name.toLowerCase() && p.id !== profile.id)
    if (duplicate) {
        showToast('Профиль с таким именем уже существует', true)
        return
    }

    // Сохранение
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
