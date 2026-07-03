const tabsEl = document.getElementById('tabs');

const render = ({ tabs, activeTabId }) => {
    tabsEl.innerHTML = '';
    tabs.forEach((tab) => {
        const el = document.createElement('div');
        el.className = 'tab' + (tab.id === activeTabId ? ' active' : '');
        el.title = tab.title || 'Linear';
        el.addEventListener('click', () => window.chrome.switchTab(tab.id));

        const label = document.createElement('span');
        label.textContent = tab.title || 'Linear';
        el.appendChild(label);

        const closeBtn = document.createElement('span');
        closeBtn.className = 'tab-close';
        closeBtn.textContent = '×';
        closeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            window.chrome.closeTab(tab.id);
        });
        el.appendChild(closeBtn);

        tabsEl.appendChild(el);
    });
};

window.chrome.onTabsUpdated(render);

document.getElementById('new-tab').addEventListener('click', () => window.chrome.newTab());
document.getElementById('min').addEventListener('click', () => window.chrome.minimize());
document.getElementById('max').addEventListener('click', () => window.chrome.maximize());
document.getElementById('close').addEventListener('click', () => window.chrome.close());
