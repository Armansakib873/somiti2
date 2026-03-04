/* =============================================
   সমবায় ফান্ড প্রো 2.0 - Complete Application Logic
   ============================================= */

// =========================================
// 1. CONFIGURATION & DEFAULT DATA
// =========================================

const APP_STORAGE_KEY = "somobayFundDataV4";

const defaultConfig = {
  monthlyInstallment: 8000,
  fundName: "সমবায় ফান্ড প্রো",
};

const defaultData = {
  config: { ...defaultConfig },
  members: [
    { id: 1, name: "মিজান ১ (Mizan 1)", deposited: 17000, phone: "", accountNo: "", openingDate: "2023-01-01" },
    { id: 2, name: "মিজান ২ (Mizan 2)", deposited: 17000, phone: "", accountNo: "", openingDate: "2023-01-01" },
    { id: 3, name: "বাপ্পি (Bappi)", deposited: 16000, phone: "", accountNo: "", openingDate: "2023-01-01" },
    { id: 4, name: "রহিম ১ (Rahim 1)", deposited: 26000, phone: "01788378146", accountNo: "FD0002", openingDate: "2023-01-01" },
    { id: 5, name: "রহিম ২ (Rahim 2)", deposited: 26000, phone: "", accountNo: "", openingDate: "2023-01-01" },
    { id: 6, name: "রাকিব ১ (Rakib 1)", deposited: 29000, phone: "", accountNo: "", openingDate: "2023-01-01" },
    { id: 7, name: "রাকিব ২ (Rakib 2)", deposited: 29000, phone: "", accountNo: "", openingDate: "2023-01-01" },
    { id: 8, name: "জুয়েল (Juwel)", deposited: 27000, phone: "", accountNo: "", openingDate: "2023-01-01" },
    { id: 9, name: "আখতার (Akhter)", deposited: 21000, phone: "", accountNo: "", openingDate: "2023-01-01" },
    { id: 10, name: "আনোয়ার (Anowar)", deposited: 23000, phone: "", accountNo: "", openingDate: "2023-01-01" },
    { id: 11, name: "জিকু (Ziku)", deposited: 29000, phone: "", accountNo: "", openingDate: "2023-01-01" },
  ],
  transactions: [
    { id: 101, type: "loan_given", desc: "ঋণ প্রদান (B)", amount: 138000, date: "2026-01-05T10:00:00.000Z" },
    { id: 102, type: "expense", desc: "চেক বই ক্রয়", amount: 100, date: "2026-01-20T10:00:00.000Z" },
    { id: 103, type: "profit", desc: "B-এর ঋণের লাভ (জানুয়ারি)", amount: 12000, date: "2026-01-31T10:00:00.000Z", source: "B" },
    { id: 104, type: "profit", desc: "B-এর ঋণের লাভ (ফেব্রুয়ারি)", amount: 2000, date: "2026-02-28T10:00:00.000Z", source: "B" },
    { id: 105, type: "fine", desc: "বিলম্ব জরিমানা", amount: 1000, date: "2026-02-01T10:00:00.000Z" },
  ],
  depositHistory: [],
};

// =========================================
// 2. STATE MANAGEMENT
// =========================================

let appState = null;
let financialMetrics = {};
let currentMonthFilter = null; // null = all time
let currentTxFilter = "all";
let confirmCallback = null;

function loadData() {
  try {
    const stored = localStorage.getItem(APP_STORAGE_KEY);
    if (stored) {
      appState = JSON.parse(stored);
      if (!appState.config) appState.config = { ...defaultConfig };
      if (!appState.depositHistory) appState.depositHistory = [];
      // Migrate: rename expectedDeposit -> monthlyInstallment
      if (appState.config.expectedDeposit && !appState.config.monthlyInstallment) {
        appState.config.monthlyInstallment = appState.config.expectedDeposit;
        delete appState.config.expectedDeposit;
      }
      // Migrate: add profile fields to members
      appState.members.forEach(m => {
        if (m.phone === undefined) m.phone = "";
        if (m.accountNo === undefined) m.accountNo = "";
        if (m.openingDate === undefined) m.openingDate = "";
      });
    } else {
      // Try importing from older versions
      const oldData = localStorage.getItem("somobayFundDataV3") || localStorage.getItem("somobayFundDataV2");
      if (oldData) {
        const parsed = JSON.parse(oldData);
        appState = {
          config: { ...defaultConfig, ...(parsed.config || {}) },
          members: (parsed.members || []).map(m => ({
            ...m,
            phone: m.phone || "",
            accountNo: m.accountNo || "",
            openingDate: m.openingDate || "",
          })),
          transactions: parsed.transactions || [],
          depositHistory: parsed.depositHistory || [],
        };
        if (appState.config.expectedDeposit && !appState.config.monthlyInstallment) {
          appState.config.monthlyInstallment = appState.config.expectedDeposit;
          delete appState.config.expectedDeposit;
        }
      } else {
        appState = JSON.parse(JSON.stringify(defaultData));
      }
    }
    saveData();
  } catch (e) {
    console.error("Data load error:", e);
    appState = JSON.parse(JSON.stringify(defaultData));
    saveData();
  }
}

function saveData() {
  try {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
  } catch (e) {
    console.error("Save error:", e);
  }
}

// =========================================
// 3. FORMATTING UTILITIES
// =========================================

const bengaliDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

function toBengaliNum(n) {
  return String(n).replace(/\d/g, d => bengaliDigits[d]);
}

function fmtCurrency(num) {
  if (num === undefined || num === null || isNaN(num)) return "৳০";
  const absNum = Math.abs(num);
  // Indian numbering system formatting
  let formatted;
  if (absNum >= 10000000) {
    formatted = (absNum / 10000000).toFixed(2) + " কোটি";
  } else if (absNum >= 100000) {
    formatted = (absNum / 100000).toFixed(2) + " লক্ষ";
  } else {
    formatted = absNum.toLocaleString("en-IN");
  }
  
  // Convert to Bengali
  formatted = toBengaliNum(formatted);
  const sign = num < 0 ? "-" : "";
  return `${sign}৳${formatted}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("bn-BD", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch (e) {
    return dateStr;
  }
}

function fmtShortDate(dateStr) {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("bn-BD", {
      day: "numeric",
      month: "short",
    });
  } catch (e) {
    return dateStr;
  }
}

const bengaliMonths = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল",
  "মে", "জুন", "জুলাই", "আগস্ট",
  "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"
];

function getMonthLabel(date) {
  return `${bengaliMonths[date.getMonth()]} ${toBengaliNum(date.getFullYear())}`;
}

const typeTranslations = {
  deposit: "জমা",
  loan_given: "ঋণ প্রদান",
  loan_repaid: "ঋণ ফেরত",
  profit: "আয়",
  fine: "জরিমানা",
  expense: "খরচ",
  loss: "ক্ষতি",
};

const typeIcons = {
  deposit: "fa-hand-holding-dollar",
  loan_given: "fa-paper-plane",
  loan_repaid: "fa-rotate-left",
  profit: "fa-chart-line",
  fine: "fa-gavel",
  expense: "fa-money-bill-transfer",
  loss: "fa-arrow-trend-down",
};

// =========================================
// 4. FINANCIAL CALCULATIONS
// =========================================

function getFilteredTransactions() {
  if (!currentMonthFilter) return appState.transactions;
  
  const year = currentMonthFilter.getFullYear();
  const month = currentMonthFilter.getMonth();
  
  return appState.transactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate.getFullYear() === year && txDate.getMonth() === month;
  });
}

function getFilteredDeposits() {
  if (!currentMonthFilter) return appState.depositHistory || [];
  
  const year = currentMonthFilter.getFullYear();
  const month = currentMonthFilter.getMonth();
  
  return (appState.depositHistory || []).filter(d => {
    const dDate = new Date(d.date);
    return dDate.getFullYear() === year && dDate.getMonth() === month;
  });
}

function calculateFinances() {
  // Always calculate from ALL data (not filtered) for total state
  let totalDeposits = appState.members.reduce((sum, m) => sum + m.deposited, 0);

  let loansGiven = 0, loansRepaid = 0, totalProfit = 0, totalFines = 0, totalExpenses = 0, totalLoss = 0;

  appState.transactions.forEach(tx => {
    if (tx.type === "loan_given") loansGiven += tx.amount;
    if (tx.type === "loan_repaid") loansRepaid += tx.amount;
    if (tx.type === "profit") totalProfit += tx.amount;
    if (tx.type === "fine") totalFines += tx.amount;
    if (tx.type === "expense") totalExpenses += tx.amount;
    if (tx.type === "loss") totalLoss += tx.amount;
  });

  let totalInflows = totalDeposits + totalProfit + totalFines + loansRepaid;
  let totalOutflows = loansGiven + totalExpenses + totalLoss;
  let liquidCash = totalInflows - totalOutflows;
  let outstandingLoans = loansGiven - loansRepaid;
  let fundEquity = totalDeposits + totalProfit + totalFines - totalExpenses - totalLoss;
  let netProfit = totalProfit + totalFines - totalExpenses - totalLoss;
  let profitPerMember = appState.members.length > 0 ? netProfit / appState.members.length : 0;

  // Calculate filtered metrics
  const filteredTx = getFilteredTransactions();
  let fLoansGiven = 0, fLoansRepaid = 0, fProfit = 0, fFines = 0, fExpenses = 0, fLoss = 0;
  let fDeposits = 0;

  filteredTx.forEach(tx => {
    if (tx.type === "loan_given") fLoansGiven += tx.amount;
    if (tx.type === "loan_repaid") fLoansRepaid += tx.amount;
    if (tx.type === "profit") fProfit += tx.amount;
    if (tx.type === "fine") fFines += tx.amount;
    if (tx.type === "expense") fExpenses += tx.amount;
    if (tx.type === "loss") fLoss += tx.amount;
  });

  getFilteredDeposits().forEach(d => {
    fDeposits += d.amount;
  });

  // Due calculation: each member owes monthlyInstallment per month
  const monthlyInstallment = appState.config?.monthlyInstallment || 8000;
  // All members have a flat due of monthlyInstallment (per the CSV pattern)
  const dueMembers = appState.members.map(m => ({
    ...m,
    dueAmount: monthlyInstallment,
  }));
  const totalDue = dueMembers.reduce((sum, m) => sum + m.dueAmount, 0);

  financialMetrics = {
    totalDeposits,
    outstandingLoans,
    totalRevenue: totalProfit + totalFines,
    totalExpenses,
    totalLoss,
    liquidCash,
    fundEquity,
    profitPerMember,
    netProfit,
    totalProfit,
    totalFines,
    loansGiven,
    loansRepaid,
    dueMembers,
    totalDue,
    dueMembersCount: dueMembers.length,
    memberCount: appState.members.length,
    monthlyInstallment,
    // Filtered
    filtered: {
      loansGiven: fLoansGiven,
      loansRepaid: fLoansRepaid,
      profit: fProfit,
      fines: fFines,
      expenses: fExpenses,
      loss: fLoss,
      deposits: fDeposits,
      revenue: fProfit + fFines,
      netProfit: fProfit + fFines - fExpenses - fLoss,
    }
  };
}

// =========================================
// 5. UI RENDERING
// =========================================

function updateHeader() {
  // Update date
  const now = new Date();
  const dateEl = document.getElementById("header-date");
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString("bn-BD", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  // Update fund name
  const title = document.querySelector(".header-brand h1");
  if (title && appState.config?.fundName) {
    title.textContent = appState.config.fundName;
  }

  // Update month filter label
  const monthLabel = document.getElementById("month-label");
  if (monthLabel) {
    monthLabel.textContent = currentMonthFilter
      ? getMonthLabel(currentMonthFilter)
      : "সর্বকালীন";
  }
}

function updateBalanceHero() {
  const m = financialMetrics;
  document.getElementById("liquid-cash").textContent = fmtCurrency(m.liquidCash);
  document.getElementById("hero-equity").textContent = fmtCurrency(m.fundEquity);
  document.getElementById("hero-loans").textContent = fmtCurrency(m.outstandingLoans);
}

function updateDashboardStats() {
  const m = financialMetrics;
  const isFiltered = currentMonthFilter !== null;
  document.getElementById("total-members").textContent = toBengaliNum(m.memberCount);
  document.getElementById("due-members").textContent = toBengaliNum(m.dueMembersCount);
  document.getElementById("total-revenue").textContent = fmtCurrency(isFiltered ? m.filtered.revenue : m.totalRevenue);
  document.getElementById("total-expenses").textContent = fmtCurrency(isFiltered ? m.filtered.expenses : m.totalExpenses);
}

function renderRecentTransactions() {
  const container = document.getElementById("recent-transactions");
  if (!container) return;

  const allTx = getAllTransactionsForDisplay();
  const recent = allTx.slice(0, 5);

  if (recent.length === 0) {
    container.innerHTML = renderEmptyState("fas fa-receipt", "কোনো লেনদেন পাওয়া যায়নি");
    return;
  }

  container.innerHTML = recent.map((tx, i) => renderTransactionItem(tx, i, false)).join("");
}

function getAllTransactionsForDisplay() {
  // Combine deposit history + transactions
  const deposits = (appState.depositHistory || []).map(d => ({
    ...d,
    type: "deposit",
  }));

  const allTx = [...appState.transactions, ...deposits];

  // Apply month filter
  let filtered = allTx;
  if (currentMonthFilter) {
    const year = currentMonthFilter.getFullYear();
    const month = currentMonthFilter.getMonth();
    filtered = allTx.filter(tx => {
      const txDate = new Date(tx.date);
      return txDate.getFullYear() === year && txDate.getMonth() === month;
    });
  }

  // Sort by date descending
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  return filtered;
}

function renderTransactionItem(tx, index, showDelete = true) {
  const isOutflow = tx.type === "loan_given" || tx.type === "expense" || tx.type === "loss";
  const isProfit = tx.type === "profit" || tx.type === "fine";
  const isDeposit = tx.type === "deposit";

  let colorClass = isOutflow ? (tx.type === "loss" ? "tx-loss" : "tx-out") : isProfit ? "tx-profit" : isDeposit ? "tx-deposit" : "tx-in";
  let sign = isOutflow ? "−" : "+";
  let label = typeTranslations[tx.type] || tx.type;
  let amountColor = isOutflow ? "var(--danger)" : "var(--primary)";

  const icon = typeIcons[tx.type] || "fa-circle";
  const deleteBtn = showDelete ? `<button class="tx-delete-btn" onclick="deleteTransaction(${tx.id}, '${tx.type === 'deposit' ? 'deposit' : 'tx'}', event)" title="মুছুন"><i class="fas fa-trash-alt"></i></button>` : "";

  return `
    <div class="list-item animate-in" style="animation-delay: ${index * 30}ms">
      <div class="item-info">
        <h4>${tx.desc || tx.memberName || label}</h4>
        <span class="tx-type ${colorClass}"><i class="fas ${icon}"></i> ${label}</span>
      </div>
      <div style="display:flex;align-items:center;">
        <div class="item-value">
          <h4 style="color: ${amountColor}">${sign}${fmtCurrency(tx.amount)}</h4>
          <p>${fmtShortDate(tx.date)}</p>
        </div>
        ${deleteBtn}
      </div>
    </div>
  `;
}

function renderTransactions() {
  const container = document.getElementById("transactions-list");
  if (!container) return;

  let allTx = getAllTransactionsForDisplay();

  // Apply type filter
  if (currentTxFilter !== "all") {
    allTx = allTx.filter(tx => tx.type === currentTxFilter);
  }

  if (allTx.length === 0) {
    container.innerHTML = renderEmptyState("fas fa-receipt", "কোনো লেনদেন পাওয়া যায়নি");
    return;
  }

  container.innerHTML = allTx.map((tx, i) => renderTransactionItem(tx, i, true)).join("");
}

function renderMembers() {
  const m = financialMetrics;
  document.getElementById("profit-per-member").textContent = `লভ্যাংশ: ${fmtCurrency(m.profitPerMember)}`;

  const container = document.getElementById("members-list");
  if (!container) return;

  const monthlyInstallment = appState.config?.monthlyInstallment || 8000;
  const searchQuery = (document.getElementById("member-search")?.value || "").toLowerCase();

  let members = appState.members;
  if (searchQuery) {
    members = members.filter(m => m.name.toLowerCase().includes(searchQuery));
  }

  if (members.length === 0) {
    container.innerHTML = renderEmptyState("fas fa-users", "কোনো সদস্য পাওয়া যায়নি");
    return;
  }

  container.innerHTML = members.map((member, i) => {
    const individualEquity = member.deposited + m.profitPerMember;
    const dueAmount = monthlyInstallment;

    const statusBadge = `<span class="status-badge status-due"><i class="fas fa-clock"></i> মাসিক বকেয়া: ${fmtCurrency(dueAmount)}</span>`;

    return `
      <div class="list-item animate-in" style="animation-delay: ${i * 30}ms" onclick="showMemberDetail(${member.id})">
        <div class="item-info">
          <h4>${member.name}</h4>
          <p>জমা: ${fmtCurrency(member.deposited)}</p>
          ${statusBadge}
        </div>
        <div class="item-value">
          <h4 style="color: var(--primary)">${fmtCurrency(individualEquity)}</h4>
          <p>মোট পাওনা</p>
        </div>
      </div>
    `;
  }).join("");
}

function renderMemberDetail(memberId) {
  const member = appState.members.find(m => m.id === memberId);
  if (!member) return;

  const container = document.getElementById("member-detail-content");
  if (!container) return;

  const monthlyInstallment = appState.config?.monthlyInstallment || 8000;
  const m = financialMetrics;
  const individualEquity = member.deposited + m.profitPerMember;
  const dueAmount = monthlyInstallment - (member.deposited % monthlyInstallment);
  const initial = member.name.charAt(0);

  // Get member's deposit history
  const memberDeposits = (appState.depositHistory || [])
    .filter(d => d.memberId === member.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Get member's loan-related transactions
  const memberLoans = appState.transactions
    .filter(tx => tx.desc && tx.desc.includes(member.name.split(" ")[0]) && 
      (tx.type === "loan_given" || tx.type === "loan_repaid"))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // Profile info section
  const profileInfo = `
    <div class="member-profile-section">
      ${member.accountNo ? `<div class="profile-row"><i class="fas fa-id-card"></i><span>একাউন্ট নং: ${member.accountNo}</span></div>` : ''}
      ${member.phone ? `<div class="profile-row"><i class="fas fa-phone"></i><span>ফোন: ${member.phone}</span></div>` : ''}
      ${member.openingDate ? `<div class="profile-row"><i class="fas fa-calendar-plus"></i><span>যোগদানের তারিখ: ${fmtDate(member.openingDate)}</span></div>` : ''}
    </div>
  `;

  container.innerHTML = `
    <div class="member-detail-header">
      <div class="member-avatar">${initial}</div>
      <h2>${member.name}</h2>
      <p>সদস্য আইডি: ${toBengaliNum(member.id)}</p>
    </div>

    ${profileInfo}

    <div class="member-stats-grid">
      <div class="member-stat-card">
        <span class="ms-label">মোট জমা</span>
        <span class="ms-value ms-blue">${fmtCurrency(member.deposited)}</span>
      </div>
      <div class="member-stat-card">
        <span class="ms-label">মোট পাওনা</span>
        <span class="ms-value ms-green">${fmtCurrency(individualEquity)}</span>
      </div>
      <div class="member-stat-card">
        <span class="ms-label">লভ্যাংশ</span>
        <span class="ms-value ms-orange">${fmtCurrency(m.profitPerMember)}</span>
      </div>
      <div class="member-stat-card">
        <span class="ms-label">মাসিক বকেয়া</span>
        <span class="ms-value ms-red">${fmtCurrency(dueAmount)}</span>
      </div>
    </div>

    ${memberDeposits.length > 0 ? `
      <div class="section-title" style="margin-top:16px;">জমার ইতিহাস</div>
      ${memberDeposits.map((d, i) => `
        <div class="list-item animate-in" style="animation-delay: ${i * 30}ms">
          <div class="item-info">
            <h4>জমা প্রদান</h4>
            <p>${fmtDate(d.date)}</p>
          </div>
          <div class="item-value">
            <h4 style="color: var(--primary)">+${fmtCurrency(d.amount)}</h4>
          </div>
        </div>
      `).join("")}
    ` : ""}

    ${memberLoans.length > 0 ? `
      <div class="section-title" style="margin-top:16px;">ঋণ সম্পর্কিত</div>
      ${memberLoans.map((tx, i) => renderTransactionItem(tx, i, false)).join("")}
    ` : ""}
  `;
}

function renderLoans() {
  const m = financialMetrics;
  document.getElementById("loan-total-given").textContent = fmtCurrency(m.loansGiven);
  document.getElementById("loan-total-repaid").textContent = fmtCurrency(m.loansRepaid);
  document.getElementById("loan-outstanding").textContent = fmtCurrency(m.outstandingLoans);

  const container = document.getElementById("loans-detail-list");
  if (!container) return;

  // Get all loan transactions
  const loanTx = appState.transactions
    .filter(tx => tx.type === "loan_given" || tx.type === "loan_repaid")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  if (loanTx.length === 0) {
    container.innerHTML = renderEmptyState("fas fa-handshake", "কোনো ঋণের রেকর্ড নেই");
    return;
  }

  // Group by borrower name approx
  const loanGroups = {};
  loanTx.forEach(tx => {
    const key = tx.desc || "অজানা";
    if (!loanGroups[key]) {
      loanGroups[key] = { given: 0, repaid: 0, transactions: [] };
    }
    if (tx.type === "loan_given") loanGroups[key].given += tx.amount;
    if (tx.type === "loan_repaid") loanGroups[key].repaid += tx.amount;
    loanGroups[key].transactions.push(tx);
  });

  container.innerHTML = loanTx.map((tx, i) => {
    const isGiven = tx.type === "loan_given";
    const statusClass = isGiven ? "ldi-active" : "ldi-cleared";
    const statusText = isGiven ? "ঋণ প্রদান" : "ঋণ ফেরত";
    const amountColor = isGiven ? "var(--accent)" : "var(--primary)";

    return `
      <div class="loan-detail-item animate-in" style="animation-delay: ${i * 30}ms">
        <div class="ldi-header">
          <span class="ldi-name">${tx.desc}</span>
          <span class="ldi-amount" style="color:${amountColor}">${fmtCurrency(tx.amount)}</span>
        </div>
        <div class="ldi-meta">
          <span>${fmtDate(tx.date)}</span>
          <span class="ldi-status-badge ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderDue() {
  const m = financialMetrics;
  const monthlyInstallment = appState.config?.monthlyInstallment || 8000;

  document.getElementById("total-due-amount").textContent = fmtCurrency(m.totalDue);
  document.getElementById("due-members-count").textContent = `${toBengaliNum(m.dueMembersCount)} জন`;

  const container = document.getElementById("due-members-list");
  if (!container) return;

  if (m.dueMembers.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-check-double" style="color: var(--primary); opacity: 0.6;"></i>
        <p style="color: var(--primary); font-weight: 600;">সকল সদস্যের জমা সম্পূর্ণ! 🎉</p>
      </div>
    `;
    return;
  }

  container.innerHTML = m.dueMembers.map((member, i) => {
    return `
      <div class="due-item animate-in" style="animation-delay: ${i * 30}ms">
        <div>
          <div class="due-item-name">${member.name}</div>
          <div class="due-item-sub">মোট জমা: ${fmtCurrency(member.deposited)} | মাসিক কিস্তি: ${fmtCurrency(monthlyInstallment)}</div>
        </div>
        <div class="due-item-amount">${fmtCurrency(member.dueAmount)}</div>
      </div>
    `;
  }).join("");
}

function renderSummary() {
  const m = financialMetrics;
  const isFiltered = currentMonthFilter !== null;
  const f = m.filtered;

  document.getElementById("sum-deposits").textContent = fmtCurrency(isFiltered ? f.deposits : m.totalDeposits);
  document.getElementById("sum-profit").textContent = fmtCurrency(isFiltered ? f.profit : m.totalProfit);
  document.getElementById("sum-fines").textContent = fmtCurrency(isFiltered ? f.fines : m.totalFines);
  document.getElementById("sum-expenses").textContent = fmtCurrency(isFiltered ? f.expenses : m.totalExpenses);
  document.getElementById("sum-net-profit").textContent = fmtCurrency(isFiltered ? f.netProfit : m.netProfit);
  document.getElementById("sum-per-head").textContent = fmtCurrency(m.profitPerMember);

  renderMonthlySummary();
}

function renderMonthlySummary() {
  const container = document.getElementById("monthly-summary-list");
  if (!container) return;

  // Group all transactions + deposits by month
  const allTx = [...appState.transactions];
  const allDeposits = appState.depositHistory || [];

  const monthlyData = {};

  allTx.forEach(tx => {
    const date = new Date(tx.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyData[key]) {
      monthlyData[key] = { deposits: 0, loans_given: 0, loans_repaid: 0, profit: 0, fines: 0, expenses: 0 };
    }
    if (tx.type === "loan_given") monthlyData[key].loans_given += tx.amount;
    if (tx.type === "loan_repaid") monthlyData[key].loans_repaid += tx.amount;
    if (tx.type === "profit") monthlyData[key].profit += tx.amount;
    if (tx.type === "fine") monthlyData[key].fines += tx.amount;
    if (tx.type === "expense") monthlyData[key].expenses += tx.amount;
  });

  allDeposits.forEach(d => {
    const date = new Date(d.date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (!monthlyData[key]) {
      monthlyData[key] = { deposits: 0, loans_given: 0, loans_repaid: 0, profit: 0, fines: 0, expenses: 0 };
    }
    monthlyData[key].deposits += d.amount;
  });

  const sortedMonths = Object.keys(monthlyData).sort().reverse();

  if (sortedMonths.length === 0) {
    container.innerHTML = renderEmptyState("fas fa-calendar", "কোনো মাসিক ডেটা নেই");
    return;
  }

  container.innerHTML = sortedMonths.map((key, i) => {
    const data = monthlyData[key];
    const [year, month] = key.split("-");
    const monthName = `${bengaliMonths[parseInt(month) - 1]} ${toBengaliNum(year)}`;
    const netIncome = data.profit + data.fines - data.expenses;

    return `
      <div class="monthly-card animate-in" style="animation-delay: ${i * 40}ms">
        <div class="monthly-card-header">
          <span class="mc-month"><i class="fas fa-calendar-day"></i> ${monthName}</span>
          <span class="mc-total" style="color: ${netIncome >= 0 ? 'var(--primary)' : 'var(--danger)'}">${netIncome >= 0 ? '+' : ''}${fmtCurrency(netIncome)}</span>
        </div>
        <div class="mc-details">
          ${data.deposits > 0 ? `<div class="mc-detail-item"><span class="mc-detail-label">জমা</span><span class="mc-detail-value" style="color:var(--blue)">${fmtCurrency(data.deposits)}</span></div>` : ""}
          ${data.profit > 0 ? `<div class="mc-detail-item"><span class="mc-detail-label">আয়</span><span class="mc-detail-value" style="color:var(--primary)">${fmtCurrency(data.profit)}</span></div>` : ""}
          ${data.fines > 0 ? `<div class="mc-detail-item"><span class="mc-detail-label">জরিমানা</span><span class="mc-detail-value" style="color:#b45309">${fmtCurrency(data.fines)}</span></div>` : ""}
          ${data.expenses > 0 ? `<div class="mc-detail-item"><span class="mc-detail-label">খরচ</span><span class="mc-detail-value" style="color:var(--danger)">${fmtCurrency(data.expenses)}</span></div>` : ""}
          ${data.loans_given > 0 ? `<div class="mc-detail-item"><span class="mc-detail-label">ঋণ দান</span><span class="mc-detail-value" style="color:var(--accent)">${fmtCurrency(data.loans_given)}</span></div>` : ""}
          ${data.loans_repaid > 0 ? `<div class="mc-detail-item"><span class="mc-detail-label">ঋণ ফেরত</span><span class="mc-detail-value" style="color:var(--primary)">${fmtCurrency(data.loans_repaid)}</span></div>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderEmptyState(icon, message) {
  return `
    <div class="empty-state">
      <i class="${icon}"></i>
      <p>${message}</p>
    </div>
  `;
}

// =========================================
// 6. SETTINGS RENDERING
// =========================================

function loadSettings() {
  const installmentInput = document.getElementById("setting-monthly-installment");
  const nameInput = document.getElementById("setting-fund-name");
  const removeSelect = document.getElementById("remove-member-select");

  if (installmentInput) installmentInput.value = appState.config?.monthlyInstallment || 8000;
  if (nameInput) nameInput.value = appState.config?.fundName || "সমবায় ফান্ড প্রো";

  if (removeSelect) {
    removeSelect.innerHTML = appState.members.map(m =>
      `<option value="${m.id}">${m.name}</option>`
    ).join("");
  }
}

// =========================================
// 7. NAVIGATION & TAB SWITCHING
// =========================================

function switchTab(tabId, element) {
  // Handle nav items
  document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
  if (element) element.classList.add("active");

  // Also handle bottom nav matching
  const navItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (navItem) {
    document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
    navItem.classList.add("active");
  }

  // Hide all views
  document.querySelectorAll(".view-section").forEach(el => el.classList.remove("active"));

  // Show target view
  const targetView = document.getElementById(`view-${tabId}`);
  if (targetView) {
    targetView.classList.add("active");
  }

  // Scroll to top
  const mainEl = document.getElementById("main-content");
  if (mainEl) mainEl.scrollTop = 0;

  // Toggle FAB visibility
  const fab = document.getElementById("fab-btn");
  if (fab) {
    if (tabId === "settings" || tabId === "member-detail") {
      fab.classList.add("hidden");
    } else {
      fab.classList.remove("hidden");
    }
  }

  // Load settings data if settings tab
  if (tabId === "settings") {
    loadSettings();
  }
}

// =========================================
// 8. MONTH FILTER
// =========================================

function changeMonth(delta) {
  if (!currentMonthFilter) {
    // Start from current month
    currentMonthFilter = new Date();
    currentMonthFilter.setDate(1);
    currentMonthFilter.setHours(0, 0, 0, 0);
  }

  currentMonthFilter.setMonth(currentMonthFilter.getMonth() + delta);
  refreshUI();
}

function resetMonthFilter() {
  currentMonthFilter = null;
  refreshUI();
  showToast("সর্বকালীন দেখানো হচ্ছে");
}

// =========================================
// 9. TRANSACTION FILTER
// =========================================

function filterTransactions(filter, chipEl) {
  currentTxFilter = filter;

  document.querySelectorAll("#tx-filter-chips .chip").forEach(c => c.classList.remove("active"));
  if (chipEl) chipEl.classList.add("active");

  renderTransactions();
}

// =========================================
// 10. MEMBER SEARCH
// =========================================

function filterMembers() {
  renderMembers();
}

// =========================================
// 11. MEMBER DETAIL
// =========================================

function showMemberDetail(memberId) {
  renderMemberDetail(memberId);
  switchTab("member-detail", null);
}

// =========================================
// 12. MODAL MANAGEMENT
// =========================================

const txModal = document.getElementById("tx-modal");
const confirmModal = document.getElementById("confirm-modal");

function openModal(presetType) {
  if (presetType) {
    const typeSelect = document.getElementById("tx-type");
    if (typeSelect) typeSelect.value = presetType;
  }
  handleTypeChange();

  // Set today's date as default
  const dateInput = document.getElementById("tx-date");
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  txModal.classList.add("active");
}

function closeModal() {
  txModal.classList.remove("active");
  document.getElementById("tx-form").reset();
  // Reset date to today
  setTimeout(() => {
    const dateInput = document.getElementById("tx-date");
    if (dateInput) dateInput.value = new Date().toISOString().split("T")[0];
  }, 300);
}

function handleTypeChange() {
  const type = document.getElementById("tx-type").value;
  const groupText = document.getElementById("desc-group-text");
  const groupSelect = document.getElementById("desc-group-select");
  const inputText = document.getElementById("tx-desc-text");

  // Update modal title
  const modalTitle = document.getElementById("modal-title");
  if (modalTitle) {
    const titles = {
      deposit: "সদস্য জমা প্রদান",
      loan_given: "ঋণ প্রদান রেকর্ড",
      loan_repaid: "ঋণ ফেরত রেকর্ড",
      profit: "আয় / লভ্যাংশ রেকর্ড",
      fine: "জরিমানা আদায়",
      expense: "খরচের হিসাব",
      loss: "ক্ষতির হিসাব",
    };
    modalTitle.textContent = titles[type] || "নতুন লেনদেন যুক্ত করুন";
  }

  if (type === "deposit") {
    groupSelect.style.display = "block";
    groupText.style.display = "none";
    inputText.removeAttribute("required");
  } else {
    groupSelect.style.display = "none";
    groupText.style.display = "block";
    inputText.setAttribute("required", "true");
  }
}

function openConfirm(title, message, callback) {
  document.getElementById("confirm-title").textContent = title;
  document.getElementById("confirm-message").textContent = message;
  confirmCallback = callback;
  confirmModal.classList.add("active");
}

function closeConfirm() {
  confirmModal.classList.remove("active");
  confirmCallback = null;
}

document.getElementById("confirm-yes-btn").addEventListener("click", function () {
  if (confirmCallback) confirmCallback();
  closeConfirm();
});

// =========================================
// 13. FORM SUBMISSION
// =========================================

document.getElementById("tx-form").addEventListener("submit", function (e) {
  e.preventDefault();

  const type = document.getElementById("tx-type").value;
  const amount = parseFloat(document.getElementById("tx-amount").value);
  const dateInput = document.getElementById("tx-date").value;
  const date = dateInput ? new Date(dateInput).toISOString() : new Date().toISOString();

  if (!amount || amount <= 0) {
    showToast("সঠিক পরিমাণ লিখুন", true);
    return;
  }

  if (type === "deposit") {
    const memberId = parseInt(document.getElementById("tx-desc-select").value);
    const member = appState.members.find(m => m.id === memberId);
    if (member) {
      member.deposited += amount;

      // Save to deposit history for tracking
      if (!appState.depositHistory) appState.depositHistory = [];
      appState.depositHistory.push({
        id: Date.now(),
        memberId: member.id,
        memberName: member.name,
        desc: `${member.name} জমা প্রদান`,
        amount: amount,
        date: date,
      });

      showToast(`${member.name} - জমা সফল`);
    }
  } else {
    const desc = document.getElementById("tx-desc-text").value;
    if (!desc) {
      showToast("বিবরণ লিখুন", true);
      return;
    }

    appState.transactions.push({
      id: Date.now(),
      type: type,
      desc: desc,
      amount: amount,
      date: date,
    });

    showToast(`${typeTranslations[type]} - সফলভাবে রেকর্ড হয়েছে`);
  }

  saveData();
  refreshUI();
  closeModal();
});

// =========================================
// 14. DELETE TRANSACTION
// =========================================

function deleteTransaction(id, source, event) {
  if (event) event.stopPropagation();

  openConfirm(
    "লেনদেন মুছুন?",
    "এই লেনদেনটি মুছে ফেললে সংশ্লিষ্ট হিসাব পরিবর্তন হবে। আপনি কি নিশ্চিত?",
    function () {
      if (source === "deposit") {
        const deposit = (appState.depositHistory || []).find(d => d.id === id);
        if (deposit) {
          // Revert the deposit amount from member
          const member = appState.members.find(m => m.id === deposit.memberId);
          if (member) {
            member.deposited -= deposit.amount;
            if (member.deposited < 0) member.deposited = 0;
          }
          appState.depositHistory = appState.depositHistory.filter(d => d.id !== id);
        }
      } else {
        appState.transactions = appState.transactions.filter(tx => tx.id !== id);
      }

      saveData();
      refreshUI();
      showToast("লেনদেন সফলভাবে মুছে ফেলা হয়েছে");
    }
  );
}

// =========================================
// 15. MEMBER MANAGEMENT
// =========================================

function addMember() {
  const nameInput = document.getElementById("new-member-name");
  const depositInput = document.getElementById("new-member-deposit");

  const name = nameInput.value.trim();
  const deposit = parseFloat(depositInput.value) || 0;

  if (!name) {
    showToast("সদস্যের নাম লিখুন", true);
    return;
  }

  const newId = appState.members.length > 0
    ? Math.max(...appState.members.map(m => m.id)) + 1
    : 1;

  appState.members.push({
    id: newId,
    name: name,
    deposited: deposit,
    phone: (document.getElementById("new-member-phone")?.value || "").trim(),
    accountNo: (document.getElementById("new-member-account")?.value || "").trim(),
    openingDate: document.getElementById("new-member-date")?.value || new Date().toISOString().split("T")[0],
  });

  if (deposit > 0) {
    if (!appState.depositHistory) appState.depositHistory = [];
    appState.depositHistory.push({
      id: Date.now(),
      memberId: newId,
      memberName: name,
      desc: `${name} প্রারম্ভিক জমা`,
      amount: deposit,
      date: new Date().toISOString(),
    });
  }

  saveData();
  refreshUI();
  loadSettings();

  nameInput.value = "";
  depositInput.value = "0";

  showToast(`${name} সদস্য যুক্ত হয়েছে`);
}

function removeMember() {
  const select = document.getElementById("remove-member-select");
  const memberId = parseInt(select.value);
  const member = appState.members.find(m => m.id === memberId);

  if (!member) {
    showToast("সদস্য নির্বাচন করুন", true);
    return;
  }

  openConfirm(
    "সদস্য অপসারণ?",
    `"${member.name}" কে অপসারণ করলে তার সকল জমা মুছে যাবে। আপনি কি নিশ্চিত?`,
    function () {
      appState.members = appState.members.filter(m => m.id !== memberId);
      appState.depositHistory = (appState.depositHistory || []).filter(d => d.memberId !== memberId);
      saveData();
      refreshUI();
      loadSettings();
      showToast(`${member.name} অপসারিত হয়েছে`);
    }
  );
}

// =========================================
// 16. SETTINGS MANAGEMENT
// =========================================

function saveSettings() {
  const monthlyInstallment = parseFloat(document.getElementById("setting-monthly-installment").value);
  const fundName = document.getElementById("setting-fund-name").value.trim();

  if (monthlyInstallment > 0) {
    appState.config.monthlyInstallment = monthlyInstallment;
  }

  if (fundName) {
    appState.config.fundName = fundName;
  }

  saveData();
  refreshUI();
  showToast("সেটিংস সেভ হয়েছে");
}

// =========================================
// 17. DATA EXPORT/IMPORT
// =========================================

function exportData() {
  const dataStr = JSON.stringify(appState, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `somobay-fund-backup-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("ডেটা এক্সপোর্ট সম্পন্ন");
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const imported = JSON.parse(e.target.result);

      // Validate structure
      if (!imported.members || !Array.isArray(imported.members)) {
        showToast("অবৈধ ফাইল ফরম্যাট", true);
        return;
      }

      openConfirm(
        "ডেটা ইম্পোর্ট?",
        "বর্তমান সকল ডেটা প্রতিস্থাপিত হবে। আপনি কি নিশ্চিত?",
        function () {
          appState = imported;
          if (!appState.config) appState.config = { ...defaultConfig };
          if (!appState.depositHistory) appState.depositHistory = [];
          saveData();
          refreshUI();
          showToast("ডেটা সফলভাবে ইম্পোর্ট হয়েছে");
        }
      );
    } catch (err) {
      showToast("ফাইল পড়তে সমস্যা হয়েছে", true);
    }
  };
  reader.readAsText(file);

  // Reset file input
  event.target.value = "";
}

function confirmReset() {
  openConfirm(
    "সকল ডেটা মুছুন?",
    "এই কাজটি অপরিবর্তনীয়। সকল সদস্য, লেনদেন, এবং সেটিংস মুছে যাবে এবং ডিফল্ট ডেটা পুনরুদ্ধার হবে।",
    function () {
      appState = JSON.parse(JSON.stringify(defaultData));
      saveData();
      refreshUI();
      loadSettings();
      showToast("সকল ডেটা রিসেট হয়েছে");
    }
  );
}

// =========================================
// 18. TOAST NOTIFICATIONS
// =========================================

function showToast(message, isError = false) {
  const toast = document.getElementById("toast");
  const toastMsg = document.getElementById("toast-message");
  const toastIcon = toast.querySelector("i");

  toastMsg.textContent = message;
  toastIcon.className = isError ? "fas fa-exclamation-circle" : "fas fa-check-circle";
  toastIcon.style.color = isError ? "var(--danger)" : "var(--primary-light)";

  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

// =========================================
// 19. DROPDOWN POPULATION
// =========================================

function populateMemberDropdown() {
  const select = document.getElementById("tx-desc-select");
  if (!select) return;
  select.innerHTML = appState.members.map(m =>
    `<option value="${m.id}">${m.name}</option>`
  ).join("");
}

// =========================================
// 20. MASTER REFRESH
// =========================================

function refreshUI() {
  calculateFinances();
  updateHeader();
  updateBalanceHero();
  updateDashboardStats();
  renderRecentTransactions();
  renderMembers();
  renderTransactions();
  renderLoans();
  renderDue();
  renderSummary();
  populateMemberDropdown();
}

// =========================================
// 21. INITIALIZATION
// =========================================

loadData();
refreshUI();

// Set default date on date input
const dateInput = document.getElementById("tx-date");
if (dateInput) {
  dateInput.value = new Date().toISOString().split("T")[0];
}

// Close modals on overlay click
txModal.addEventListener("click", function (e) {
  if (e.target === txModal) closeModal();
});

confirmModal.addEventListener("click", function (e) {
  if (e.target === confirmModal) closeConfirm();
});

// Prevent body scroll when modal open
document.querySelectorAll(".modal-overlay").forEach(modal => {
  modal.addEventListener("touchmove", function (e) {
    if (e.target === modal) e.preventDefault();
  }, { passive: false });
});

console.log("সমবায় ফান্ড প্রো 2.0 সফলভাবে চালু হয়েছে ✅");