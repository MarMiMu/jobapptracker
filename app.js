const sbUrl = (typeof window !== 'undefined' && window.SB_URL) || '';
const sbKey = (typeof window !== 'undefined' && window.SB_KEY) || '';

if (!sbUrl || !sbKey) {
    console.error('Supabase URL and key are missing. Add them to index.html or set window.SB_URL/window.SB_KEY before app.js loads.');
} else {
    window.sbClient = window.supabase.createClient(sbUrl, sbKey);
}

const sbClient = window.sbClient;

document.getElementById('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const status = document.getElementById('login-status');

    const { error } = await sbClient.auth.signInWithPassword({ email, password });
    status.textContent = error ? error.message : '';
});

document.getElementById('signup-btn').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const status = document.getElementById('login-status');

    if (!email || password.length < 6) {
        status.textContent = 'Enter an email and a password of at least 6 characters.';
        return;
    }

    const { error } = await sbClient.auth.signUp({ email, password });
    status.textContent = error ? error.message : 'Account created. You can sign in now.';
});

async function checkSession() {
    const { data: { session } } = await sbClient.auth.getSession();
    if (session) {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        loadData(); // your existing loader
    } else {
        document.getElementById('auth-screen').style.display = 'block';
        document.getElementById('app-screen').style.display = 'none';
    }
}

sbClient.auth.onAuthStateChange(() => checkSession());
checkSession();

document.getElementById('add-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { data: { user } } = await sbClient.auth.getUser();
    const company = ev.target.company.value.trim();
    const role = ev.target.role.value.trim();
    if (!company || !user) return;

    await sbClient.from('applications').insert({
        company, role, date: todayStr(), user_id: user.id
    });
    ev.target.reset();
    loadData();
});

async function signOut() {
    await sbClient.auth.signOut();
}

let entries = [];
let dailyGoal = 5;

function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function fmtDate(iso) {
    const [y, m, d] = iso.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[parseInt(m, 10) - 1] + ' ' + parseInt(d, 10);
}

async function loadData() {
    const { data, error } = await sbClient.from('applications').select('*').order('date', { ascending: false });
    entries = data || [];
    document.querySelector('.hint').textContent = 'Logs against today\'s date. Press enter or click Log it to add.';
    render();
}

async function addEntry(company, role) {
    await sbClient.from('applications').insert({ company, role, date: todayStr() });
    await loadData();
}

async function deleteEntry(id) {
    await sbClient.from('applications').delete().eq('id', id);
    await loadData();
}

async function saveGoal() {
    try {
        await window.storage.set(GOAL_KEY, JSON.stringify(dailyGoal), false);
    } catch (e) {
        console.error('Save failed', e);
    }
}

function countsByDate() {
    const map = {};
    for (const e of entries) {
        map[e.date] = (map[e.date] || 0) + 1;
    }
    return map;
}

function countsByStatus(map, status) {
    const statusMap = {};
    for (const e of entries) {
        statusMap[e.status] = (statusMap[e.status] || 0) + 1;
    }
    return statusMap[status] || 0;
}

function bestDayCount(map) {
    return Object.values(map).reduce((max, c) => Math.max(max, c), 0);
}

function activeDayCount(map) {
    return Object.values(map).filter(c => c > 0).length;
}

function computeStreak(map) {
    let streak = 0;
    let d = new Date();
    if (!map[todayStr()]) {
        d.setDate(d.getDate() - 1);
    }
    while (true) {
        const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        if (map[key]) {
            streak++;
            d.setDate(d.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

function longestStreak(map) {
    const days = Object.keys(map).sort(); // YYYY-MM-DD sorts correctly
    if (days.length === 0) return 0;

    let longest = 1;
    let current = 1;

    for (let i = 1; i < days.length; i++) {
        const prev = new Date(days[i - 1]);
        const curr = new Date(days[i]);
        prev.setDate(prev.getDate() + 1);

        if (prev.toISOString().slice(0, 10) === days[i]) {
            current++;
            longest = Math.max(longest, current);
        } else {
            current = 1;
        }
    }

    return longest;
}

function formatKey(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function buildYearGrid(selectedYear) {
    // Start: first Sunday on or before Jan 1
    const jan1 = new Date(selectedYear, 0, 1);
    const start = new Date(jan1);
    start.setDate(start.getDate() - start.getDay());

    // End: last Saturday on or after Dec 31
    const dec31 = new Date(selectedYear, 11, 31);
    const end = new Date(dec31);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const weeks = [];
    const cur = new Date(start);
    while (cur <= end) {
        const week = [];
        for (let d = 0; d < 7; d++) {
            week.push({
                date: new Date(cur),
                key: formatKey(cur),
                inYear: cur.getFullYear() === selectedYear
            });
            cur.setDate(cur.getDate() + 1);
        }
        weeks.push(week);
        // note: no reassignment needed, `cur` is mutated in place above
    }
    return weeks;
}

function buildMonthLabels(weeks, selectedYear) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const labels = [];
    let lastMonth = -1;

    weeks.forEach((week, weekIndex) => {
        const firstInYearDay = week.find(d => d.inYear);
        if (!firstInYearDay) return;
        const month = firstInYearDay.date.getMonth();
        if (month !== lastMonth) {
            labels.push({ weekIndex, label: monthNames[month] });
            lastMonth = month;
        }
    });

    return labels;
}

function populateYearSelect() {
    const sel = document.getElementById('year-select');
    const currentYear = new Date().getFullYear();
    const earliestYear = entries.length
        ? Math.min(...entries.map(e => parseInt(e.date.slice(0, 4), 10)))
        : currentYear;

    sel.innerHTML = '';
    for (let y = currentYear; y >= earliestYear; y--) {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        sel.appendChild(opt);
    }
    sel.value = currentYear;
    sel.addEventListener('change', () => {
        render(parseInt(sel.value, 10));
    });
}

async function render(selectedYear) {
    selectedYear = selectedYear || new Date().getFullYear();
    const map = countsByDate();
    const today = todayStr();

    document.getElementById('stat-today').textContent = map[today] || 0;
    document.getElementById('stat-streak').textContent = computeStreak(map);
    document.getElementById('stat-total').textContent = entries.length;
    document.getElementById('stat-most').textContent = bestDayCount(countsByDate());
    document.getElementById('stat-activedays').textContent = activeDayCount(countsByDate());
    document.getElementById('stat-longeststreak').textContent = longestStreak(countsByDate());
    document.getElementById('stat-interview-rate').textContent = (entries.length ? Math.round((countsByStatus(map, 'interviewing') / entries.length) * 100) : 0) + "%";

    renderHeatmap(map, selectedYear);
    renderEntries();
}

function renderHeatmap(map, selectedYear) {
    const el = document.getElementById('heatmap');
    const labelsEl = document.getElementById('heatmap-months');
    el.innerHTML = '';
    labelsEl.innerHTML = '';

    const weeks = buildYearGrid(selectedYear);
    const monthLabels = buildMonthLabels(weeks, selectedYear);
    const today = todayStr();

    // month label row — one cell per week column, blank unless labeled
    weeks.forEach((week, i) => {
        const match = monthLabels.find(m => m.weekIndex === i);
        const span = document.createElement('div');
        span.className = 'month-label';
        span.textContent = match ? match.label : '';
        labelsEl.appendChild(span);
    });

    weeks.forEach(week => {
        const col = document.createElement('div');
        col.className = 'week-col';
        week.forEach(day => {
            const cell = document.createElement('div');
            cell.className = 'cell';
            if (day.key === today) {
                cell.classList.add('today');
            }
            if (!day.inYear) {
                cell.classList.add('future');
            } else {
                const c = map[day.key] || 0;
                let level = 0;
                if (c >= 1) level = 1;
                if (c >= 3) level = 2;
                if (c >= 5) level = 3;
                if (c >= 8) level = 4;
                cell.setAttribute('data-level', level);
                cell.setAttribute('data-tip', fmtDate(day.key) + ': ' + c + (c === 1 ? ' app' : ' apps'));
            }
            col.appendChild(cell);
        });
        el.appendChild(col);
    });
}

document.getElementById('entry-search').addEventListener('input', (ev) => {
    renderEntries(filterEntries(ev.target.value));
});

function filterEntries(query) {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter(e =>
        e.company.toLowerCase().includes(q) ||
        (e.role || '').toLowerCase().includes(q)
    );
}

function renderEntries(list) {
    list = list || entries;
    const el = document.getElementById('entries');
    const sorted = [...list].sort((a, b) => (b.date + b.id) > (a.date + a.id) ? 1 : -1).slice(0, 5);

    if (sorted.length === 0) {
        el.innerHTML = '<div class="empty">No applications logged yet. Add your first one above.</div>';
        return;
    }
    el.innerHTML = sorted.map(e => `
    <div class="entry-row">
      <span class="date">${fmtDate(e.date)}</span>
      <span class="company">${escapeHtml(e.company)}</span>
      <span class="role">${escapeHtml(e.role || '')}</span>
      <select class="status-select" data-status="${e.status}" data-id="${e.id}">
        <option value="applied" ${e.status === 'applied' ? 'selected' : ''}>Applied</option>
        <option value="interviewing" ${e.status === 'interviewing' ? 'selected' : ''}>Interviewing</option>
        <option value="offer" ${e.status === 'offer' ? 'selected' : ''}>Offer</option>
        <option value="rejected" ${e.status === 'rejected' ? 'selected' : ''}>Rejected</option>
        <option value="withdrawn" ${e.status === 'withdrawn' ? 'selected' : ''}>Withdrawn</option>
      </select>
      <button class="del" data-id="${e.id}" aria-label="Delete entry">&times;</button>
    </div>
  `).join('');

    el.querySelectorAll('.status-select').forEach(sel => {
        sel.addEventListener('change', () => updateStatus(sel.getAttribute('data-id'), sel.value));
    });

    el.querySelectorAll('.del').forEach(btn => {
        btn.addEventListener('click', () => deleteEntry(btn.getAttribute('data-id')));
    });
}

async function updateStatus(id, newStatus) {
    await sbClient.from('applications').update({ status: newStatus }).eq('id', id);
    await loadData();
}

function applyFilters() {
    const q = document.getElementById('entry-search').value;
    const status = document.getElementById('status-filter').value;
    let list = filterEntries(q);
    if (status) list = list.filter(e => e.status === status);
    renderEntries(list);
}

document.getElementById('entry-search').addEventListener('input', applyFilters);
document.getElementById('status-filter').addEventListener('change', applyFilters);

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

document.getElementById('add-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const company = form.company.value.trim();
    const role = form.role.value.trim();
    if (!company) return;
    entries.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        date: todayStr(),
        company,
        role
    });
    form.company.value = '';
    form.role.value = '';
    form.company.focus();
    await addEntry(company, role);
    render();
});

const goalInput = document.getElementById('goal-input');
if (goalInput) {
    goalInput.addEventListener('change', async (ev) => {
        const v = parseInt(ev.target.value, 10);
        dailyGoal = isNaN(v) || v < 1 ? 5 : v;
        ev.target.value = dailyGoal;
        await saveGoal();
    });
}
document.getElementById('today-label').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

loadData();
populateYearSelect();