/** Тема: явный выбор хранится в localStorage; отсутствие ключа = «Как в системе». */
export const THEME_STORAGE_KEY = "zaprosto-theme";

/** Инлайн-скрипт для <head>: ставит data-theme до первой отрисовки, без вспышки. Ошибки хранилища глотает. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
