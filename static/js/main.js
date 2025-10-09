document.addEventListener('DOMContentLoaded', () => {
    const loginTab = document.getElementById('login-tab');
    const registerTab = document.getElementById('register-tab');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const contextDiv = document.getElementById('django-context');
    const activeTab = contextDiv.getAttribute('data-active-tab');

    function showLogin() {
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');

        // Estilos para la pestaña de Login (Activa)
        loginTab.classList.add('bg-[#4285F4]', 'text-white');
        loginTab.classList.remove('text-gray-400');

        // Estilos para la pestaña de Registro (Inactiva)
        registerTab.classList.remove('bg-[#4285F4]', 'text-white');
        registerTab.classList.add('text-gray-400');
    }

    function showRegister() {
        registerForm.classList.remove('hidden');
        loginForm.classList.add('hidden');

        // Estilos para la pestaña de Registro (Activa)
        registerTab.classList.add('bg-[#4285F4]', 'text-white');
        registerTab.classList.remove('text-gray-400');

        // Estilos para la pestaña de Login (Inactiva)
        loginTab.classList.remove('bg-[#4285F4]', 'text-white');
        loginTab.classList.add('text-gray-400');
    }

    loginTab.addEventListener('click', showLogin);
    registerTab.addEventListener('click', showRegister);

    // Activa la pestaña correcta al cargar la página
    if (activeTab === 'register') {
        showRegister();
    } else {
        showLogin();
    }
});