
const APP_STORAGE_KEY = "somobayFundDataV4";

const defaultConfig = {
  monthlyInstallment: 1000,
  annualBooster: 5000,
  fundName: "সমবায় ফান্ড প্রো",
  penaltyPerDay: 0.1,    // 0.1% per day late
  maxPenaltyLimit: 50,    // 50% max penalty from profit
};

const defaultData = {
  config: { ...defaultConfig },
  members: [],
  transactions: [],
  depositHistory: [],
  clearanceLogs: [], // New list for archived member payouts
};

// 🟢 Move these variables to the top so they are initialized before use
let appState = null;
let financialMetrics = {};
let currentFilterMode = "all"; // "month", "year", "all"
let currentFilterYear = new Date().getFullYear();
let currentFilterMonth = new Date().getMonth();
let currentTxFilter = "all";
let currentMemberStatusFilter = "active";
let confirmCallback = null;
let summaryTableYear = new Date().getFullYear();
let quickDepositContext = null;
let editingTxId = null;
let editingTxType = null;

function _applyDefaults(data) {
  if (!data.config) data.config = { ...defaultConfig };
  if (data.config.annualBooster === undefined) data.config.annualBooster = 5000;
  if (data.config.penaltyPerDay === undefined) data.config.penaltyPerDay = 0.1;
  if (data.config.maxPenaltyLimit === undefined) data.config.maxPenaltyLimit = 50;
  if (!data.depositHistory) data.depositHistory = [];
  if (!data.clearanceLogs) data.clearanceLogs = [];
  return data;
}

function loadData() {
  // Show a loading indicator while Firebase loads
  try {
    // Use Firebase sync if available, otherwise fall back to localStorage
    if (typeof window.firebaseLoadData === "function") {
      window.firebaseLoadData(function(data) {
        try {
          if (data) {
            appState = _applyDefaults(data);
          } else {
            appState = JSON.parse(JSON.stringify(defaultData));
            saveData();
          }
        } catch (e) {
          appState = JSON.parse(JSON.stringify(defaultData));
          saveData();
        }
        refreshUI();
      });
      // While Firebase loads, use localStorage as immediate fallback so UI isn't blank
      const stored = localStorage.getItem(APP_STORAGE_KEY);
      if (stored) {
        appState = _applyDefaults(JSON.parse(stored));
      } else {
        appState = JSON.parse(JSON.stringify(defaultData));
      }
    } else {
      // Firebase not available — pure localStorage fallback
      const stored = localStorage.getItem(APP_STORAGE_KEY);
      if (stored) {
        appState = _applyDefaults(JSON.parse(stored));
      } else {
        appState = JSON.parse(JSON.stringify(defaultData));
        saveData();
      }
    }
  } catch (e) {
    appState = JSON.parse(JSON.stringify(defaultData));
    saveData();
  }
  
  // Initialize Bengali date displays after app loads
  initBengaliDateDisplays();
  initTxDynamicComment();
  initQdDynamicComment();
  initNewMemberDynamicComment();
  initEditMemberDynamicComment();
}

function saveData() {
  if (typeof window.firebaseSaveData === "function") {
    window.firebaseSaveData(appState);
  } else {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify(appState));
  }
}

const bengaliDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
function toBengaliNum(n) { 
  return String(n).replace(/\d/g, d => bengaliDigits[d]).replace(/\./g, "."); 
}

// Bengali date formatter - converts YYYY-MM-DD to "২ জানুয়ারি ২০২৫" format
function formatBengaliDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return "";
  const day = parseInt(parts[2], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[0], 10);
  if (month < 0 || month > 11 || isNaN(day) || isNaN(year)) return "";
  return `${toBengaliNum(day)} ${bengaliMonths[month]} ${toBengaliNum(year)}`;
}

// Initialize Bengali date displays for all date inputs
function initBengaliDateDisplays() {
  const dateInputs = [
    { id: "setting-fund-start-date", displayId: "setting-fund-start-date-bn" },
    { id: "new-member-date", displayId: "new-member-date-bn" },
    { id: "tx-date", displayId: "tx-date-bn" },
    { id: "qd-date", displayId: "qd-date-bn" },
    { id: "edit-joining-date", displayId: "edit-joining-date-bn" }
  ];
  
  dateInputs.forEach(item => {
    const input = document.getElementById(item.id);
    const display = document.getElementById(item.displayId);
    if (input && display) {
      // Set initial value
      display.textContent = formatBengaliDate(input.value);
      // Add event listener for changes
      input.addEventListener("change", function() {
        display.textContent = formatBengaliDate(this.value);
      });
      // Also update on input (for real-time typing)
      input.addEventListener("input", function() {
        display.textContent = formatBengaliDate(this.value);
      });
    }
  });
}

function fmtCurrency(num) {
  if (num === undefined || num === null || isNaN(num)) return "৳০";
  const absNum = Math.abs(num);
  let formatted = absNum >= 10000000 ? (absNum / 10000000).toFixed(2) + " কোটি" : absNum >= 100000 ? (absNum / 100000).toFixed(2) + " লক্ষ" : absNum.toLocaleString("en-IN");
  return `${num < 0 ? "-" : ""}৳${toBengaliNum(formatted)}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return "";
  try { return new Date(dateStr).toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return dateStr; }
}

function fmtShortDate(dateStr) {
  if (!dateStr) return "";
  try { return new Date(dateStr).toLocaleDateString("bn-BD", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return dateStr; }
}

// Number to Bengali words converter (correct Bengali numbering)
function numberToBengaliWords(num) {
  if (!num || num <= 0) return "";
  num = Math.floor(num);

  const numbers = [
    "", "এক","দুই","তিন","চার","পাঁচ","ছয়","সাত","আট","নয়","দশ",
    "এগারো","বারো","তেরো","চৌদ্দ","পনেরো","ষোল","সতেরো","আঠারো","উনিশ",
    "বিশ","একুশ","বাইশ","তেইশ","চব্বিশ","পঁচিশ","ছাব্বিশ","সাতাশ","আঠাশ","উনত্রিশ",
    "ত্রিশ","একত্রিশ","বত্রিশ","তেত্রিশ","চৌত্রিশ","পঁয়ত্রিশ","ছত্রিশ","সাঁইত্রিশ","আটত্রিশ","উনচল্লিশ",
    "চল্লিশ","একচল্লিশ","বিয়াল্লিশ","তেতাল্লিশ","চুয়াল্লিশ","পঁয়তাল্লিশ","ছেচল্লিশ","সাতচল্লিশ","আটচল্লিশ","উনপঞ্চাশ",
    "পঞ্চাশ","একান্ন","বাহান্ন","তিপ্পান্ন","চুয়ান্ন","পঞ্চান্ন","ছাপ্পান্ন","সাতান্ন","আটান্ন","উনষাট",
    "ষাট","একষট্টি","বাষট্টি","তেষট্টি","চৌষট্টি","পঁয়ষট্টি","ছেষট্টি","সাতষট্টি","আটষট্টি","উনসত্তর",
    "সত্তর","একাত্তর","বাহাত্তর","তিয়াত্তর","চুয়াত্তর","পঁচাত্তর","ছিয়াত্তর","সাতাত্তর","আটাত্তর","উনআশি",
    "আশি","একাশি","বিরাশি","তিরাশি","চুরাশি","পঁচাশি","ছিয়াশি","সাতাশি","আটাশি","উননব্বই",
    "নব্বই","একানব্বই","বিরানব্বই","তিরানব্বই","চুরানব্বই","পঁচানব্বই","ছিয়ানব্বই","সাতানব্বই","আটানব্বই","নিরানব্বই"
  ];

  const scales = [
    { value: 10000000, name: "কোটি" },
    { value: 100000, name: "লক্ষ" },
    { value: 1000, name: "হাজার" },
    { value: 100, name: "শত" }
  ];

  if (num < 100) return numbers[num];

  let result = "";

  for (let scale of scales) {
    if (num >= scale.value) {
      const count = Math.floor(num / scale.value);
      num = num % scale.value;

      if (scale.value === 100) {
        result += numbers[count] + " " + scale.name + " ";
      } else {
        result += numberToBengaliWords(count) + " " + scale.name + " ";
      }
    }
  }

  if (num > 0) {
    result += numbers[num] + " ";
  }

  return result.trim();
}

function showAmountInWords(val) {
  const span = document.getElementById("amount-in-words");
  if (!span) return;

  const num = parseFloat(val);

  if (!val || isNaN(num) || num <= 0) {
    span.textContent = "";
  } else {
    span.textContent = numberToBengaliWords(num);
  }
}

const bengaliMonths = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];
function getMonthLabel(date) { return `${bengaliMonths[date.getMonth()]} ${toBengaliNum(date.getFullYear())}`; }

function getDurationLabel(start, end) {
    if (!start || !end) return "---";
    const s = new Date(start);
    const e = new Date(end);
    let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
    if (months < 0) months = 0;
    
    if (months >= 12) {
        const y = Math.floor(months / 12);
        const m = months % 12;
        return `${toBengaliNum(y)} বছর ${m > 0 ? toBengaliNum(m) + ' মাস' : ''}`;
    }
    return `${toBengaliNum(months)} মাস`;
}

const typeTranslations = { deposit: "জমা", loan_given: "ঋণ প্রদান", loan_repaid: "ঋণ ফেরত", profit: "আয়/লাভ", fine: "জরিমানা", expense: "খরচ", loss: "ক্ষতি" };
const typeIcons = { deposit: "fa-hand-holding-dollar", loan_given: "fa-paper-plane", loan_repaid: "fa-rotate-left", profit: "fa-chart-line", fine: "fa-gavel", expense: "fa-money-bill-transfer", loss: "fa-arrow-trend-down" };

// Audit Helper: Get the relevant "For Month/Year" of a deposit record
function getDepositTarget(d) {
    if (d.targetYear !== undefined && d.targetMonth !== undefined) {
        return { year: d.targetYear, month: d.targetMonth };
    }
    // Fallback for old records
    const dt = new Date(d.date);
    return { year: dt.getFullYear(), month: dt.getMonth() };
}

function getFilteredTransactions() {
  if (!appState || !appState.transactions) return [];
  if (currentFilterMode === "all") return appState.transactions;
  return appState.transactions.filter(tx => { 
      const d = new Date(tx.date); 
      if (currentFilterMode === "year") return d.getFullYear() === currentFilterYear;
      return d.getFullYear() === currentFilterYear && d.getMonth() === currentFilterMonth; 
  });
}

function getFilteredDeposits() {
  if (!appState || !appState.depositHistory) return [];
  if (currentFilterMode === "all") return appState.depositHistory || [];
  return (appState.depositHistory || []).filter(d => { 
      const dt = new Date(d.date); 
      if (currentFilterMode === "year") return dt.getFullYear() === currentFilterYear;
      return dt.getFullYear() === currentFilterYear && dt.getMonth() === currentFilterMonth; 
  });
}

function calculateFinances() {
  // === Rebuild each member's deposited amount from depositHistory (single source of truth) ===
  const depositHistoryByMember = {};
  (appState.depositHistory || []).forEach(d => {
    if (!depositHistoryByMember[d.memberId]) depositHistoryByMember[d.memberId] = 0;
    depositHistoryByMember[d.memberId] += (d.amount || 0);
  });

  // Audit: Synchronize each member's .deposited property with history for consistency
  appState.members.forEach(m => {
    m.deposited = (depositHistoryByMember[m.id] || 0);
  });

  // Calculate total deposits from everyone (including archived members) to keep the books balanced
  let totalDeposits = appState.members.reduce((sum, m) => sum + (m.deposited || 0), 0);
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
  
  // নিট লাভ এবং সমান বণ্টন (Net Profit & Equal Distribution)
  let netProfit = totalProfit + totalFines - totalExpenses - totalLoss;
  let fundEquity = totalDeposits + netProfit;

  // Audit #4: Only divide profit among ACTIVE (non-archived) members
  const activeMembersList = appState.members.filter(m => !m.archived);
  const totalActiveDeposits = activeMembersList.reduce((sum, m) => sum + (depositHistoryByMember[m.id] || 0), 0);
  
  // --- New Logic: Profit Share & Penalty System ---
  const globalStart = new Date(appState.config?.fundStartDate || "2025-01-01");
  const today = new Date();
  // FIX: currentYear/currentMonth defined here for global scope within this func
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const pPerDay = appState.config?.penaltyPerDay || 0.1;
  const maxP = appState.config?.maxPenaltyLimit || 50;

  activeMembersList.forEach(m => {
      let joinDate = new Date(m.openingDate || "2025-01-01");
      if(isNaN(joinDate)) joinDate = new Date("2025-01-01");
      let effDate = joinDate > globalStart ? joinDate : globalStart;
      
      let totalLateDays = 0;
      let startY = effDate.getFullYear();
      let startM = effDate.getMonth();
      // For each expected month
      for (let y = startY; y <= currentYear; y++) {
          let s = (y === startY) ? startM : 0;
          let e = (y === currentYear) ? currentMonth : 11;
          for (let mo = s; mo <= e; mo++) {
              // Deadline is 1st day of NEXT month
              const dueDate = new Date(y, mo + 1, 1);
              // Find deposit for this target slot
              const recs = (appState.depositHistory || []).filter(d => {
                  const target = getDepositTarget(d);
                  return d.memberId === m.id && target.year === y && target.month === mo;
              });
              
              if (recs.length === 0) {
                  // Not paid yet: if due date passed, count late days until today
                  if (today > dueDate) {
                      totalLateDays += Math.max(0, Math.floor((today - dueDate) / (1000 * 60 * 60 * 24)));
                  }
              } else {
                  // Paid: find the actual payment date (use the latest record if multiple)
                  const latestActual = new Date(Math.max(...recs.map(r => new Date(r.date))));
                  if (latestActual > dueDate) {
                      totalLateDays += Math.max(0, Math.floor((latestActual - dueDate) / (1000 * 60 * 60 * 24)));
                  }
              }
          }
      }
      m.totalLateDays = totalLateDays;
      m.penaltyPercent = Math.min(maxP, totalLateDays * pPerDay);
  });

  // Distribute Base Profit (Protecting Principal: only distribute if netProfit is positive)
  let distributableNetProfit = Math.max(0, netProfit);
  activeMembersList.forEach(m => {
      const dep = depositHistoryByMember[m.id] || 0;
      m.baseProfitShare = totalActiveDeposits > 0 ? (dep / totalActiveDeposits) * distributableNetProfit : 0;
      m.penaltyAmount = m.baseProfitShare * (m.penaltyPercent / 100);
      m.unpenalizedProfit = m.baseProfitShare - m.penaltyAmount;
  });

  const totalPenalizedPool = activeMembersList.reduce((sum, m) => sum + m.penaltyAmount, 0);
  
  // Redistribution Logic: Give back pool to members weighted by (100 - penaltyPercent) * deposit
  let totalIncentiveWeight = 0;
  activeMembersList.forEach(m => {
      const dep = depositHistoryByMember[m.id] || 0;
      m.incentiveWeight = (100 - m.penaltyPercent) * dep;
      totalIncentiveWeight += m.incentiveWeight;
  });

  activeMembersList.forEach(m => {
      const incentive = totalIncentiveWeight > 0 ? (m.incentiveWeight / totalIncentiveWeight) * totalPenalizedPool : 0;
      m.finalProfitShare = parseFloat((m.unpenalizedProfit + incentive).toFixed(2));
      m.penaltyPercent = parseFloat(m.penaltyPercent.toFixed(2));
      m.penaltyAmount = parseFloat(m.penaltyAmount.toFixed(2));
  });
  
  // Legacy compatibility / Avg Display
  let profitPerMember = activeMembersList.length > 0 ? netProfit / activeMembersList.length : 0;

  // Audit #2: Round all core values to 2 decimal places to prevent floating point issues
  totalDeposits = parseFloat(totalDeposits.toFixed(2));
  loansGiven = parseFloat(loansGiven.toFixed(2));
  loansRepaid = parseFloat(loansRepaid.toFixed(2));
  totalProfit = parseFloat(totalProfit.toFixed(2));
  totalFines = parseFloat(totalFines.toFixed(2));
  totalExpenses = parseFloat(totalExpenses.toFixed(2));
  totalLoss = parseFloat(totalLoss.toFixed(2));
  liquidCash = parseFloat(liquidCash.toFixed(2));
  outstandingLoans = parseFloat(outstandingLoans.toFixed(2));
  netProfit = parseFloat(netProfit.toFixed(2));
  fundEquity = parseFloat(fundEquity.toFixed(2));
  profitPerMember = parseFloat(profitPerMember.toFixed(2));

  // Filtered metrics
  const filteredTx = getFilteredTransactions();
  let fLoansGiven = 0, fLoansRepaid = 0, fProfit = 0, fFines = 0, fExpenses = 0, fLoss = 0, fDeposits = 0;
  filteredTx.forEach(tx => {
    if (tx.type === "loan_given") fLoansGiven += tx.amount;
    if (tx.type === "loan_repaid") fLoansRepaid += tx.amount;
    if (tx.type === "profit") fProfit += tx.amount;
    if (tx.type === "fine") fFines += tx.amount;
    if (tx.type === "expense") fExpenses += tx.amount;
    if (tx.type === "loss") fLoss += tx.amount;
  });
  getFilteredDeposits().forEach(d => { fDeposits += d.amount; });

  // Due Calculation based on Global Start Date & Opening Date
  const monthlyInstallment = appState.config?.monthlyInstallment || 1000;
  const annualBooster = appState.config?.annualBooster || 5000;

  const processedMembers = appState.members.map(m => {
      let joinDate = new Date(m.openingDate || "2025-01-01");
      if(isNaN(joinDate)) joinDate = new Date("2025-01-01");
      
      // Effective Date: সমিতি শুরু অথবা সদস্য যোগদানের মধ্যে যেটি পরে আসবে
      let effectiveDate = joinDate > globalStart ? joinDate : globalStart;
      
      let monthsPassed = (currentYear - effectiveDate.getFullYear()) * 12 + (currentMonth - effectiveDate.getMonth()) + 1;
      if (monthsPassed < 0) monthsPassed = 0;
      
      // Running year এ পা দিলেই booster ডিউ হয়ে যাবে
      let yearsPassed = Math.ceil(monthsPassed / 12);
      let expectedTotal = (monthsPassed * monthlyInstallment) + (yearsPassed * annualBooster);
      let dueAmount = expectedTotal - m.deposited;

      return {
          ...m,
          expectedTotal,
          dueAmount: dueAmount > 0 ? dueAmount : 0
      };
  });

  const dueMembersList = processedMembers.filter(m => m.dueAmount > 0 && !m.archived);
  const totalDue = dueMembersList.reduce((sum, m) => sum + m.dueAmount, 0);
  financialMetrics = {
    totalDeposits, outstandingLoans, totalRevenue: totalProfit + totalFines, totalExpenses: totalExpenses + totalLoss, liquidCash, fundEquity,
    profitPerMember, netProfit, totalProfit, totalFines, loansGiven, loansRepaid,
    processedMembers, dueMembers: dueMembersList, totalDue, dueMembersCount: dueMembersList.length, memberCount: processedMembers.length,
    filtered: { revenue: fProfit + fFines, expenses: fExpenses + fLoss, netProfit: fProfit + fFines - fExpenses - fLoss, deposits: fDeposits, profit: fProfit, fines: fFines }
  };
}

function updateHeader() {
  const dateEl = document.getElementById("header-date");
  if (dateEl) dateEl.textContent = new Date().toLocaleDateString("bn-BD", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const title = document.querySelector(".header-brand h1");
  if (title && appState.config?.fundName) title.textContent = appState.config.fundName;
  const filterLabel = document.getElementById("month-label");
  if (filterLabel) {
      if (currentFilterMode === "all") filterLabel.innerHTML = "সর্বকালীন <small>(All Time)</small>";
      else if (currentFilterMode === "year") filterLabel.textContent = `${toBengaliNum(currentFilterYear)} (সম্পূর্ণ বছর)`;
      else filterLabel.textContent = `${bengaliMonths[currentFilterMonth]} ${toBengaliNum(currentFilterYear)}`;
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
  const isFiltered = currentFilterMode !== "all";
  document.getElementById("total-members").textContent = toBengaliNum(m.memberCount);
  document.getElementById("due-members").textContent = toBengaliNum(m.dueMembersCount);
  document.getElementById("total-revenue").textContent = fmtCurrency(isFiltered ? m.filtered.revenue : m.totalRevenue);
  document.getElementById("total-expenses").textContent = fmtCurrency(isFiltered ? m.filtered.expenses : m.totalExpenses);
}

let txVisibleCount = 30;
const TX_PAGE_SIZE = 30;

function getAllTransactionsForDisplay() {
  const deposits = (appState.depositHistory || []).map(d => ({ ...d, type: "deposit" }));
  let filtered = [...appState.transactions, ...deposits];
  if (currentFilterMode !== "all") {
    filtered = filtered.filter(tx => {
        const d = new Date(tx.date);
        if (currentFilterMode === "year") return d.getFullYear() === currentFilterYear;
        return d.getFullYear() === currentFilterYear && d.getMonth() === currentFilterMonth;
    });
  }
  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  return filtered;
}

function renderTransactionItem(tx, index, showDelete = true) {
  const isOutflow = tx.type === "loan_given" || tx.type === "expense" || tx.type === "loss";
  const colorClass = isOutflow ? (tx.type === "loss" ? "tx-loss" : "tx-out") : (tx.type === "profit" || tx.type === "fine") ? "tx-profit" : tx.type === "deposit" ? "tx-deposit" : "tx-in";
  const editBtn = showDelete ? `<button class="tx-edit-btn" onclick="editTransaction(${tx.id}, '${tx.type}', event)" style="background:none;border:none;cursor:pointer;color:var(--primary);margin-right:8px;padding-left:15px;"><i class="fas fa-edit"></i></button>` : "";
  const deleteBtn = showDelete ? `<button class="tx-delete-btn" onclick="deleteTransaction(${tx.id}, '${tx.type}', event)"><i class="fas fa-trash-alt"></i></button>` : "";
  
  // Audit dual-date display
  let targetInfo = "";
  if (tx.type === "deposit" || tx.type === "fine") {
      const target = getDepositTarget(tx);
      targetInfo = `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">মাসের জন্য: ${bengaliMonths[target.month]} ${toBengaliNum(target.year)}</div>`;
  }

  return `
    <div class="list-item animate-in" style="animation-delay: ${index * 30}ms">
      <div class="item-info">
        <h4>${tx.desc || tx.memberName || typeTranslations[tx.type]}</h4>
        <span class="tx-type ${colorClass}"><i class="fas ${typeIcons[tx.type] || "fa-circle"}"></i> ${typeTranslations[tx.type]}</span>
        ${targetInfo}
      </div>
      <div style="display:flex;align-items:center;">
        <div class="item-value">
          <h4 style="color: ${isOutflow ? "var(--danger)" : "var(--primary)"}">${isOutflow ? "−" : "+"}${fmtCurrency(tx.amount)}</h4>
          <p>${fmtShortDate(tx.date)}</p>
        </div>
        ${editBtn}${deleteBtn}
      </div>
    </div>
  `;
}

function renderRecentTransactions() {
  const container = document.getElementById("recent-transactions");
  if (!container) return;
  const recent = getAllTransactionsForDisplay().slice(0, 5);
  container.innerHTML = recent.length === 0 ? renderEmptyState("fas fa-receipt", "কোনো লেনদেন পাওয়া যায়নি") : recent.map((tx, i) => renderTransactionItem(tx, i, false)).join("");
}

function renderTransactions(resetPage = true) {
  const container = document.getElementById("transactions-list");
  if (!container) return;
  if (resetPage) txVisibleCount = TX_PAGE_SIZE;
  let allTx = getAllTransactionsForDisplay();
  if (currentTxFilter !== "all") allTx = allTx.filter(tx => tx.type === currentTxFilter);
  
  const visible = allTx.slice(0, txVisibleCount);
  const hasMore = allTx.length > txVisibleCount;
  const loadMoreBtn = hasMore ? `<div style="text-align:center; padding: 12px;">
    <button onclick="loadMoreTransactions()" style="background: var(--primary); color: #fff; border: none; border-radius: 20px; padding: 8px 24px; font-size: 0.9rem; cursor: pointer;">
      আরও দেখুন (${allTx.length - txVisibleCount} টি বাকি)
    </button>
  </div>` : '';
  
  container.innerHTML = allTx.length === 0
    ? renderEmptyState("fas fa-receipt", "কোনো লেনদেন পাওয়া যায়নি")
    : visible.map((tx, i) => renderTransactionItem(tx, i, true)).join("") + loadMoreBtn;
}

function loadMoreTransactions() {
  txVisibleCount += TX_PAGE_SIZE;
  renderTransactions(false);
}

function filterMemberStatus(status, el) {
  currentMemberStatusFilter = status;
  document.querySelectorAll("#member-status-filter .chip").forEach(c => c.classList.remove("active"));
  if(el) el.classList.add("active");
  
  const membersList = document.getElementById("members-list");
  const logContainer = document.getElementById("clearance-log-container");
  const searchContainer = document.getElementById("member-search-container");

  if (status === 'removed') {
    membersList.style.display = "none";
    logContainer.style.display = "block";
    searchContainer.style.display = "none";
    renderClearanceLog();
  } else {
    membersList.style.display = "block";
    logContainer.style.display = "none";
    searchContainer.style.display = "flex";
    renderMembers();
  }
}

function renderMembers() {
  const m = financialMetrics;
  document.getElementById("profit-per-member").textContent = `লভ্যাংশ: ${fmtCurrency(m.profitPerMember)}`;
  
  if (currentMemberStatusFilter === 'removed') {
      renderClearanceLog();
      return;
  }

  const container = document.getElementById("members-list");
  if (!container) return;

  const searchQuery = (document.getElementById("member-search")?.value || "").toLowerCase();
  
  // Audit #4: Only show active (non-archived) members
  let members = m.processedMembers.filter(mbr => !mbr.archived);
  
  if (searchQuery) members = members.filter(mbr => 
    mbr.name.toLowerCase().includes(searchQuery) || 
    (mbr.englishName && mbr.englishName.toLowerCase().includes(searchQuery))
  );

  if (members.length === 0) { container.innerHTML = renderEmptyState("fas fa-users", "কোনো সদস্য পাওয়া যায়নি"); return; }

  container.innerHTML = members.map((member, i) => {
    const individualEquity = member.deposited + (member.finalProfitShare || 0);
    const statusBadge = member.dueAmount > 0 
      ? `<span class="status-badge status-due"><i class="fas fa-exclamation-circle"></i> ডিউ: ${fmtCurrency(member.dueAmount)}</span>`
      : `<span class="status-badge status-paid"><i class="fas fa-check-circle"></i> জমা সম্পূর্ণ</span>`;

    return `
      <div class="list-item animate-in" style="animation-delay: ${i * 30}ms" onclick="showMemberDetail(${member.id})">
        <div class="item-info">
          <h4>${member.name}</h4>
          <p>মোট জমা: ${fmtCurrency(member.deposited)}</p>
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
  const m = financialMetrics;
  const member = m.processedMembers.find(mbr => mbr.id === memberId);
  if (!member) return;

  const profitShare = member.finalProfitShare || 0;
  const individualEquity = member.deposited + profitShare;
  const memberDeposits = (appState.depositHistory || []).filter(d => d.memberId === member.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const memberLoans = appState.transactions.filter(tx => tx.desc && tx.desc.includes(member.name.split(" ")[0]) && (tx.type === "loan_given" || tx.type === "loan_repaid")).sort((a, b) => new Date(b.date) - new Date(a.date));

  // Build the display name — show English name in parentheses if it exists
  const rawMember = appState.members.find(rm => rm.id === memberId);
  const displayName = rawMember?.englishName ? `${member.name} (${rawMember.englishName})` : member.name;

  document.getElementById("member-detail-content").innerHTML = `
    <div class="member-detail-header">
      <div class="member-avatar">${member.name.charAt(0)}</div>
      <h2>${displayName}</h2>
      <p>সদস্য আইডি: ${toBengaliNum(member.id)}</p>
      <div style="display: flex; gap: 8px; justify-content: center; margin-top: 10px;">
        <button class="edit-btn-inline" onclick="openEditMember(${member.id})" style="margin-top:0;">
          <i class="fas fa-pen"></i> তথ্য এডিট করুন
        </button>
        <button class="edit-btn-inline" onclick="exportActiveMemberReport(${member.id})" style="margin-top:0; background: var(--primary); color: white; border-color: var(--primary);">
          <i class="fas fa-file-image"></i> অফিসিয়াল রিপোর্ট (A4)
        </button>
      </div>
    </div>
    <div class="member-profile-section">
      ${member.accountNo ? `<div class="profile-row"><i class="fas fa-id-card"></i><span>একাউন্ট নং: ${member.accountNo}</span></div>` : ''}
      ${member.phone ? `<div class="profile-row"><i class="fas fa-phone"></i><span>ফোন: ${member.phone}</span></div>` : ''}
      ${rawMember?.email ? `<div class="profile-row"><i class="fas fa-envelope" style="color:#ea4335;"></i><span>ইমেইল: ${rawMember.email}</span></div>` : ''}
      <div class="profile-row"><i class="fas fa-calendar-plus"></i><span>যোগদানের তারিখ: ${fmtDate(member.openingDate)}</span></div>
      <div class="profile-row"><i class="fas fa-bullseye"></i><span>টার্গেট জমা: ${fmtCurrency(member.expectedTotal)}</span></div>
    </div>
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
        <span class="ms-value ms-orange">${fmtCurrency(profitShare)}</span>
      </div>
      <div class="member-stat-card tappable" onclick="openDueSummary(${member.id})">
        <span class="tap-hint"><i class="fas fa-hand-pointer"></i> ট্যাপ</span>
        <span class="ms-label">মোট ডিউ (বকেয়া)</span>
        <span class="ms-value ms-red">${fmtCurrency(member.dueAmount)}</span>
      </div>
    </div>
    <!-- Discipline & Penalty Section -->
    <div class="discipline-section animate-in" style="margin-top:20px; padding:16px; background: ${member.penaltyPercent > 0 ? '#fff7ed' : '#f0fdf4'}; border-radius:var(--radius-md); border: 1px solid ${member.penaltyPercent > 0 ? '#ffedd5' : '#dcfce7'};">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h4 style="margin:0; font-size:1rem; color: ${member.penaltyPercent > 0 ? '#9a3412' : '#166534'};">
                <i class="fas ${member.penaltyPercent > 0 ? 'fa-hourglass-half' : 'fa-award'}"></i> ডিসিপ্লিন স্কোর
            </h4>
            <span style="font-size:0.85rem; padding:4px 10px; border-radius:20px; background:${member.penaltyPercent > 0 ? '#fed7aa' : '#bbf7d0'}; color:${member.penaltyPercent > 0 ? '#9a3412' : '#166534'}; font-weight:600;">
                পেনাল্টি: ${toBengaliNum((member.penaltyPercent || 0).toFixed(2))}%
            </span>
        </div>
        <div class="delay-progress-container" style="height:8px; background:#e5e7eb; border-radius:4px; overflow:hidden; margin-bottom:10px;">
            <div style="width: ${member.penaltyPercent}%; height:100%; background:var(--danger); transition:width 1s ease-out;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted);">
            <span>সর্বমোট বিলম্ব: ${toBengaliNum(member.totalLateDays)} দিন</span>
            <span>কাটা হয়েছে: ${fmtCurrency(member.penaltyAmount)}</span>
        </div>
        <p style="margin-top:10px; font-size:0.75rem; font-style:italic; color:var(--text-muted);">
            ${member.penaltyPercent === 0 
                ? "চমৎকার! আপনি সময়মতো জমা দিয়েছেন এবং অন্যদের জরিমানার অংশ থেকেও লাভ পেয়েছেন।" 
                : "বিলম্ব করে জমা দেওয়ার কারণে আপনার লভ্যাংশ থেকে পেনাল্টি কাটা হয়েছে।"}
        </p>
    </div>

    ${memberDeposits.length > 0 ? `<div class="section-title">জমার ইতিহাস</div>${memberDeposits.map((d, i) => `<div class="list-item animate-in" style="animation-delay:${i*30}ms"><div class="item-info"><h4>জমা প্রদান</h4><p>${fmtDate(d.date)}</p></div><div class="item-value"><h4 style="color:var(--primary)">+${fmtCurrency(d.amount)}</h4></div></div>`).join("")}` : ""}
    ${memberLoans.length > 0 ? `<div class="section-title">ঋণ সম্পর্কিত</div>${memberLoans.map((tx, i) => renderTransactionItem(tx, i, false)).join("")}` : ""}
  `;
}

// ঋণের বিস্তারিত রেন্ডার করা (গ্রুপিং ও প্রোগ্রেস বার সহ)
function renderLoans() {
  const m = financialMetrics;
  document.getElementById("loan-total-given").textContent = fmtCurrency(m.loansGiven);
  document.getElementById("loan-total-repaid").textContent = fmtCurrency(m.loansRepaid);
  document.getElementById("loan-outstanding").textContent = fmtCurrency(m.outstandingLoans);

  const container = document.getElementById("loans-detail-list");
  const loanTx = appState.transactions.filter(tx => tx.type === "loan_given" || tx.type === "loan_repaid");
  
  if (loanTx.length === 0) { container.innerHTML = renderEmptyState("fas fa-handshake", "কোনো ঋণের রেকর্ড নেই"); return; }
  
  // লোনগুলোকে নাম (desc) অনুযায়ী গ্রুপ করা
  const loanGroups = {};
  loanTx.forEach(tx => {
    const key = tx.desc || "অজানা ঋণ";
    if (!loanGroups[key]) {
      loanGroups[key] = { given: 0, repaid: 0, lastDate: tx.date };
    }
    if (tx.type === "loan_given") loanGroups[key].given += tx.amount;
    if (tx.type === "loan_repaid") loanGroups[key].repaid += tx.amount;
    
    if (new Date(tx.date) > new Date(loanGroups[key].lastDate)) {
      loanGroups[key].lastDate = tx.date;
    }
  });

  // গ্রুপ করা ডেটা দিয়ে কার্ড তৈরি করা
  container.innerHTML = Object.keys(loanGroups).map((key, i) => {
    const data = loanGroups[key];
    const outstanding = data.given - data.repaid;
    const progress = data.given > 0 ? (data.repaid / data.given) * 100 : 0;
    const isCleared = outstanding <= 0;
    
    return `
      <div class="loan-detail-item loan-group-card animate-in" style="animation-delay: ${i * 30}ms" onclick="openLoanHistory('${key}')">
        <div class="ldi-header">
          <span class="ldi-name" style="font-size: 1rem;">${key}</span>
          <span class="ldi-amount" style="color: ${isCleared ? 'var(--primary)' : 'var(--danger)'}; font-size: 1.1rem;">
            ${isCleared ? 'পরিশোধিত' : fmtCurrency(outstanding)}
          </span>
        </div>
        <div style="font-size: 0.75rem; color: var(--text-secondary); display: flex; justify-content: space-between; margin-top: 4px;">
          <span>মোট প্রদান: <b>${fmtCurrency(data.given)}</b></span>
          <span>ফেরত এসেছে: <b style="color:var(--primary)">${fmtCurrency(data.repaid)}</b></span>
        </div>
        <div class="loan-progress-bg">
          <div class="loan-progress-fill" style="width: ${Math.min(progress, 100)}%; background: ${isCleared ? 'var(--primary)' : 'var(--accent)'};"></div>
        </div>
      </div>
    `;
  }).join("");
}

// লোন হিস্ট্রি মডেল ওপেন করা
function openLoanHistory(desc) {
  currentLoanHistoryDesc = desc;
  document.getElementById("lh-title").textContent = desc;
  const summaryContainer = document.getElementById("lh-summary-container");
  const listContainer = document.getElementById("lh-list");

  // ওই নির্দিষ্ট লোনের সমস্ত লেনদেন বের করা
  const history = appState.transactions
    .filter(tx => tx.desc === desc && (tx.type === "loan_given" || tx.type === "loan_repaid"))
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  let totalGiven = 0, totalRepaid = 0;
  history.forEach(tx => {
    if (tx.type === "loan_given") totalGiven += tx.amount;
    if (tx.type === "loan_repaid") totalRepaid += tx.amount;
  });
  const outstanding = totalGiven - totalRepaid;

  // সামারি বক্স আপডেট করা
  summaryContainer.innerHTML = `
    <div class="loan-summary-box">
      <div class="loan-summary-row">
        <span style="color: var(--text-secondary);">সর্বমোট প্রদান:</span>
        <span style="font-weight: 700;">${fmtCurrency(totalGiven)}</span>
      </div>
      <div class="loan-summary-row">
        <span style="color: var(--text-secondary);">সর্বমোট ফেরত:</span>
        <span style="font-weight: 700; color: var(--primary);">${fmtCurrency(totalRepaid)}</span>
      </div>
      <div class="loan-summary-row">
        <span style="font-weight: 700;">বর্তমান বকেয়া:</span>
        <span style="font-weight: 700; color: ${outstanding > 0 ? 'var(--danger)' : 'var(--primary)'}">${fmtCurrency(outstanding)}</span>
      </div>
    </div>
  `;

  // হিস্ট্রি লিস্ট আপডেট করা
  listContainer.innerHTML = history.map((tx, i) => `
    <div class="list-item" style="padding: 10px 14px; margin-bottom: 6px;">
      <div class="item-info">
        <h4 style="font-size: 0.9rem;">${tx.type === 'loan_given' ? 'ঋণ দেওয়া হয়েছে' : 'ঋণ ফেরত এসেছে'}</h4>
        <p>${fmtDate(tx.date)}</p>
      </div>
      <div class="item-value">
        <h4 style="font-size: 1rem; color: ${tx.type === 'loan_given' ? 'var(--accent)' : 'var(--primary)'};">
          ${tx.type === 'loan_given' ? '−' : '+'}${fmtCurrency(tx.amount)}
        </h4>
      </div>
      <!-- চাইলে এখান থেকে ডিলিট বাটনও যুক্ত করা যায় -->
      <button class="tx-delete-btn" onclick="deleteTransaction(${tx.id}, '${tx.type}', event)"><i class="fas fa-trash-alt"></i></button>
    </div>
  `).join("");

  document.getElementById("loan-history-modal").classList.add("active");
  
  // Show/hide Return Loan button based on outstanding balance
  const returnBtn = document.getElementById("btn-return-loan");
  if (returnBtn) {
    returnBtn.style.display = outstanding > 0 ? "inline-block" : "none";
  }
}

function closeLoanHistory() {
  document.getElementById("loan-history-modal").classList.remove("active");
}

// Store current loan desc for return
let currentLoanHistoryDesc = null;

function openLoanReturnFromHistory() {
  if (!currentLoanHistoryDesc) return;
  closeLoanHistory();
  openModal('loan_repaid');
  populateActiveLoans();
  // Pre-select the loan
  setTimeout(() => {
    const loanSelect = document.getElementById("tx-loan-select");
    if (loanSelect) loanSelect.value = currentLoanHistoryDesc;
  }, 100);
}

function renderDue() {
  const m = financialMetrics;
  document.getElementById("total-due-amount").textContent = fmtCurrency(m.totalDue);
  document.getElementById("due-members-count").textContent = `${toBengaliNum(m.dueMembersCount)} জন`;

  const container = document.getElementById("due-members-list");
  const dueList = m.dueMembers.filter(member => !member.archived);
  
  if (dueList.length === 0) {
    container.innerHTML = `<div class="empty-state"><i class="fas fa-check-double" style="color:var(--primary);opacity:0.6;"></i><p style="color:var(--primary);font-weight:600;">সকল সদস্যের জমা সম্পূর্ণ! 🎉</p></div>`;
    return;
  }
  container.innerHTML = dueList.map((member, i) => `
    <div class="due-item animate-in" style="animation-delay: ${i * 30}ms" onclick="openDueSummary(${member.id})">
      <div>
        <div class="due-item-name">${member.name}</div>
        <div class="due-item-sub">টার্গেট: ${fmtCurrency(member.expectedTotal)} | জমা: ${fmtCurrency(member.deposited)}</div>
      </div>
      <div class="due-item-amount">${fmtCurrency(member.dueAmount)}</div>
    </div>
  `).join("");
}

function renderSummary() {
  const m = financialMetrics;
  const isFiltered = currentFilterMode !== "all";
  document.getElementById("sum-deposits").textContent = fmtCurrency(isFiltered ? m.filtered.deposits : m.totalDeposits);
  document.getElementById("sum-profit").textContent = fmtCurrency(isFiltered ? m.filtered.profit : m.totalProfit);
  document.getElementById("sum-fines").textContent = fmtCurrency(isFiltered ? m.filtered.fines : m.totalFines);
  document.getElementById("sum-expenses").textContent = fmtCurrency(isFiltered ? m.filtered.expenses : m.totalExpenses);
  document.getElementById("sum-net-profit").textContent = fmtCurrency(isFiltered ? m.filtered.netProfit : m.netProfit);
  document.getElementById("sum-per-head").textContent = fmtCurrency(m.profitPerMember);

  const container = document.getElementById("monthly-summary-list");
  const monthlyData = {};
  [...appState.transactions].forEach(tx => {
    const d = new Date(tx.date); const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!monthlyData[k]) monthlyData[k] = { deposits:0, loans_given:0, loans_repaid:0, profit:0, fines:0, expenses:0 };
    if (tx.type === "loan_given") monthlyData[k].loans_given += tx.amount;
    if (tx.type === "loan_repaid") monthlyData[k].loans_repaid += tx.amount;
    if (tx.type === "profit") monthlyData[k].profit += tx.amount;
    if (tx.type === "fine") monthlyData[k].fines += tx.amount;
    if (tx.type === "expense" || tx.type === "loss") monthlyData[k].expenses += tx.amount;
  });
  (appState.depositHistory || []).forEach(d => {
    const dt = new Date(d.date); const k = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
    if (!monthlyData[k]) monthlyData[k] = { deposits:0, loans_given:0, loans_repaid:0, profit:0, fines:0, expenses:0 };
    monthlyData[k].deposits += d.amount;
  });

  const sorted = Object.keys(monthlyData).sort().reverse();
  if(sorted.length===0){ container.innerHTML = renderEmptyState("fas fa-calendar", "কোনো মাসিক ডেটা নেই"); return;}
  
  container.innerHTML = sorted.map((k, i) => {
    const data = monthlyData[k]; const [y, m] = k.split("-");
    const netIncome = data.profit + data.fines - data.expenses;
    return `
      <div class="monthly-card animate-in" style="animation-delay: ${i * 40}ms">
        <div class="monthly-card-header">
          <span class="mc-month"><i class="fas fa-calendar-day"></i> ${bengaliMonths[parseInt(m)-1]} ${toBengaliNum(y)}</span>
          <span class="mc-total" style="color: ${netIncome >= 0 ? 'var(--primary)' : 'var(--danger)'}">${netIncome >= 0 ? '+' : ''}${fmtCurrency(netIncome)}</span>
        </div>
        <div class="mc-details">
          ${data.deposits>0 ? `<div class="mc-detail-item"><span class="mc-detail-label">জমা</span><span style="color:var(--blue);font-weight:600;">${fmtCurrency(data.deposits)}</span></div>`:""}
          ${data.profit>0 ? `<div class="mc-detail-item"><span class="mc-detail-label">লাভ</span><span style="color:var(--primary);font-weight:600;">${fmtCurrency(data.profit)}</span></div>`:""}
          ${data.fines>0 ? `<div class="mc-detail-item"><span class="mc-detail-label">জরিমানা</span><span style="color:#b45309;font-weight:600;">${fmtCurrency(data.fines)}</span></div>`:""}
          ${data.expenses>0 ? `<div class="mc-detail-item"><span class="mc-detail-label">খরচ</span><span style="color:var(--danger);font-weight:600;">${fmtCurrency(data.expenses)}</span></div>`:""}
        </div>
      </div>
    `;
  }).join("");
}

function renderEmptyState(icon, msg) { return `<div class="empty-state"><i class="${icon}"></i><p>${msg}</p></div>`; }

function loadSettings() {
  document.getElementById("setting-monthly-installment").value = appState.config?.monthlyInstallment || 1000;
  document.getElementById("setting-annual-booster").value = appState.config?.annualBooster || 5000;
  document.getElementById("setting-fund-name").value = appState.config?.fundName || "সমবায় ফান্ড প্রো";
  document.getElementById("setting-fund-start-date").value = appState.config?.fundStartDate || "2025-01-01";
  
  // New Profit Share & Penalty Settings
  document.getElementById("setting-penalty-rate").value = appState.config?.penaltyPerDay || 0.1;
  document.getElementById("setting-max-penalty").value = appState.config?.maxPenaltyLimit || 50;
  
  // Audit #4: only show active members in the removal select
  const activeMembers = appState.members.filter(m => !m.archived);
  document.getElementById("remove-member-select").innerHTML = activeMembers.map(m => `<option value="${m.id}">${m.name}</option>`).join("");
}

function saveSettings() {
  const m = parseFloat(document.getElementById("setting-monthly-installment").value);
  const b = parseFloat(document.getElementById("setting-annual-booster").value);
  const f = document.getElementById("setting-fund-name").value.trim();
  const sDate = document.getElementById("setting-fund-start-date").value;
  
  const pRate = parseFloat(document.getElementById("setting-penalty-rate").value);
  const maxP = parseFloat(document.getElementById("setting-max-penalty").value);
  
  if(!isNaN(m) && m >= 0) appState.config.monthlyInstallment = m;
  if(!isNaN(b) && b >= 0) appState.config.annualBooster = b;
  if(f) appState.config.fundName = f;
  if(sDate) appState.config.fundStartDate = sDate;
  
  if(!isNaN(pRate) && pRate >= 0) appState.config.penaltyPerDay = pRate;
  if(!isNaN(maxP) && maxP >= 0 && maxP <= 100) appState.config.maxPenaltyLimit = maxP;
  
  saveData(); refreshUI(); showToast("সেটিংস সেভ হয়েছে");
}

function switchTab(tabId, el) {
  document.querySelectorAll(".nav-item").forEach(e => e.classList.remove("active"));
  if (el) el.classList.add("active");
  const navItem = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
  if (navItem) { document.querySelectorAll(".nav-item").forEach(e => e.classList.remove("active")); navItem.classList.add("active"); }
  document.querySelectorAll(".view-section").forEach(e => e.classList.remove("active"));
  const view = document.getElementById(`view-${tabId}`);
  if (view) view.classList.add("active");
  const main = document.getElementById("main-content"); if (main) main.scrollTop = 0;
  const fab = document.getElementById("fab-btn");
  if (fab) { (tabId === "settings" || tabId === "member-detail") ? fab.classList.add("hidden") : fab.classList.remove("hidden"); }
  if (tabId === "settings") loadSettings();
}

function toggleFilterMode() {
    if (currentFilterMode === "month") currentFilterMode = "year";
    else if (currentFilterMode === "year") currentFilterMode = "all";
    else {
        currentFilterMode = "month";
        currentFilterYear = new Date().getFullYear();
        currentFilterMonth = new Date().getMonth();
    }
    refreshUI();
    const modes = { month: "মাসের হিসাব", year: "বছরের হিসাব", all: "সকল হিসাব" };
    showToast(modes[currentFilterMode] + " চালু হয়েছে");
}

function changeFilterStep(delta) {
    if (currentFilterMode === "all") {
        currentFilterMode = "month";
        currentFilterYear = new Date().getFullYear();
        currentFilterMonth = new Date().getMonth();
    }
    
    if (currentFilterMode === "month") {
        let d = new Date(currentFilterYear, currentFilterMonth + delta, 1);
        currentFilterYear = d.getFullYear();
        currentFilterMonth = d.getMonth();
    } else if (currentFilterMode === "year") {
        currentFilterYear += delta;
    }
    refreshUI();
}

function filterTransactions(f, el) { currentTxFilter = f; document.querySelectorAll("#tx-filter-chips .chip").forEach(c => c.classList.remove("active")); if(el) el.classList.add("active"); renderTransactions(true); }
function navigateToTransactions(filter) {
  switchTab('transactions', document.querySelector('[data-tab="transactions"]'));
  const chip = document.querySelector(`#tx-filter-chips .chip[data-filter="${filter}"]`);
  filterTransactions(filter, chip);
}
function filterMembers() { renderMembers(); }
function showMemberDetail(id) { renderMemberDetail(id); switchTab("member-detail", null); }

function openModal(type) {
  if(type) document.getElementById("tx-type").value = type;
  
  // Populate target years (range: fund start - current+1)
  const ySel = document.getElementById("tx-target-year");
  if (ySel) {
    const startY = 2024;
    const curY = new Date().getFullYear() + 1;
    ySel.innerHTML = "";
    for(let y=curY; y>=startY; y--) {
      ySel.innerHTML += `<option value="${y}">${toBengaliNum(y)}</option>`;
    }
    ySel.value = new Date().getFullYear();
  }
  document.getElementById("tx-target-month").value = new Date().getMonth();

  handleTypeChange();
  const dInput = document.getElementById("tx-date");
  if(!dInput.value) dInput.value = new Date().toLocaleDateString('en-CA');
  document.getElementById("tx-modal").classList.add("active");
}
function closeModal() {
  document.getElementById("tx-modal").classList.remove("active");
  document.getElementById("tx-form").reset();
  // Reset edit mode
  editingTxId = null;
  editingTxType = null;
  // Reset modal title
  const modalTitle = document.getElementById("modal-title");
  if (modalTitle) modalTitle.innerHTML = `<i class="fas fa-plus-circle"></i> নতুন লেনদেন`;
  setTimeout(() => { const d = document.getElementById("tx-date"); if(d) d.value = new Date().toISOString().split("T")[0]; }, 300);
}

function handleTypeChange() {
    const type = document.getElementById("tx-type").value;
    const gSelect = document.getElementById("desc-group-select");
    const gText = document.getElementById("desc-group-text");
    const gLoan = document.getElementById("desc-group-loan");
    const gTarget = document.getElementById("target-month-group");
    const iText = document.getElementById("tx-desc-text");
    
    gSelect.style.display = "none";
    gText.style.display = "none";
    if (gLoan) gLoan.style.display = "none";
    if (gTarget) gTarget.style.display = "none";
    iText.removeAttribute("required");
    iText.value = ""; // ক্লিয়ার ফিল্ড
    
    if (type === "deposit") {
        gSelect.style.display = "block";
        if (gTarget) gTarget.style.display = "block";
    } else if (type === "fine") {
        gSelect.style.display = "block"; // মেম্বার সিলেক্ট শো করবে
        gText.style.display = "block"; // বিবরণ বক্সও শো করবে
        if (gTarget) gTarget.style.display = "block"; // জরিমানাও হয়তো কোনো নির্দিষ্ট মাসের জন্য হয়
        iText.placeholder = "বিবরণ (ঐচ্ছিক, যেমন: দেরিতে জমা)";
    } else if (type === "loan_repaid") {
        if (gLoan) gLoan.style.display = "block";
        populateActiveLoans();
    } else {
        gText.style.display = "block";
        iText.setAttribute("required", "true");
        iText.placeholder = "যেমন: চেক বই ক্রয় / মেস ঋণ";
    }
    
    const modalTitle = document.getElementById("modal-title");
    if (modalTitle) {
        const titles = { deposit: "সদস্য জমা প্রদান", loan_given: "ঋণ প্রদান রেকর্ড", loan_repaid: "ঋণ ফেরত রেকর্ড", profit: "আয় / লভ্যাংশ রেকর্ড", fine: "জরিমানা আদায়", expense: "খরচের হিসাব", loss: "ক্ষতির হিসাব" };
        modalTitle.textContent = titles[type] || "নতুন লেনদেন যুক্ত করুন";
    }
    
    updateTxDynamicComment();
}
// নতুন ফাংশন: চলমান ঋণগুলো খুঁজে বের করে ড্রপডাউনে বসানো

// Dynamic comment updater for transaction modal
function updateTxDynamicComment() {
    const commentEl = document.getElementById("tx-dynamic-comment");
    if (!commentEl) return;
    
    const type = document.getElementById("tx-type")?.value;
    let comment = "";
    
    if (type === "deposit") {
        // Get member name from select
        const memberSelect = document.getElementById("tx-desc-select");
        const memberName = memberSelect?.options[memberSelect?.selectedIndex]?.text || "";
        
        // Get target month/year
        const targetMonth = document.getElementById("tx-target-month")?.value;
        const targetYear = document.getElementById("tx-target-year")?.value;
        const monthName = bengaliMonths[targetMonth] || "";
        const yearStr = targetYear ? toBengaliNum(targetYear) : "";
        
        // Get amount
        const amount = document.getElementById("tx-amount")?.value || "";
        const amountBn = amount ? toBengaliNum(amount) : "";
        
        // Get date
        const dateVal = document.getElementById("tx-date")?.value;
        const dateBn = formatBengaliDate(dateVal);
        
        if (memberName && amount && monthName && yearStr) {
            comment = `<i class="fas fa-info-circle"></i> ${memberName} ${monthName} ${yearStr} এর জন্য ${amountBn} টাকা জমা দিচ্ছেন।<br> জমার তারিখঃ ${dateBn}`;
        } else if (memberName && amount) {
            comment = `<i class="fas fa-info-circle"></i> ${memberName} ${amountBn} টাকা জমা দিচ্ছেন।`;
        } else {
            comment = `<i class="fas fa-edit"></i> সদস্য নির্বাচন করুন এবং তথ্য প্রদান করুন`;
        }
    } else if (type === "loan_given") {
        const desc = document.getElementById("tx-desc-text")?.value || "";
        const amount = document.getElementById("tx-amount")?.value || "";
        const amountBn = amount ? toBengaliNum(amount) : "";
        const dateVal = document.getElementById("tx-date")?.value;
        const dateBn = formatBengaliDate(dateVal);
        
        if (desc && amount) {
            comment = `<i class="fas fa-money-bill-wave"></i> ${desc} কে ${amountBn} টাকা ঋণ প্রদান করা হচ্ছে। তারিখঃ ${dateBn}`;
        } else {
            comment = `<i class="fas fa-edit"></i> ঋণ গ্রহীতার নাম এবং পরিমাণ লিখুন`;
        }
    } else if (type === "loan_repaid") {
        const loanSelect = document.getElementById("tx-loan-select");
        const loanDesc = loanSelect?.options[loanSelect?.selectedIndex]?.value || "";
        const amount = document.getElementById("tx-amount")?.value || "";
        const amountBn = amount ? toBengaliNum(amount) : "";
        const dateVal = document.getElementById("tx-date")?.value;
        const dateBn = formatBengaliDate(dateVal);
        
        if (loanDesc && amount) {
            comment = `<i class="fas fa-hand-holding-usd"></i> ${loanDesc} এর কাছ থেকে ${amountBn} টাকা ঋণ ফেরত পাওয়া যাচ্ছে। তারিখঃ ${dateBn}`;
        } else {
            comment = `<i class="fas fa-edit"></i> ঋণ নির্বাচন করুন এবং পরিমাণ প্রদান করুন`;
        }
    } else if (type === "fine") {
        const memberSelect = document.getElementById("tx-desc-select");
        const memberName = memberSelect?.options[memberSelect?.selectedIndex]?.text || "";
        const amount = document.getElementById("tx-amount")?.value || "";
        const amountBn = amount ? toBengaliNum(amount) : "";
        const dateVal = document.getElementById("tx-date")?.value;
        const dateBn = formatBengaliDate(dateVal);
        
        if (memberName && amount) {
            comment = `<i class="fas fa-gavel"></i> ${memberName} এর কাছ থেকে ${amountBn} টাকা জরিমানা আদায় করা হচ্ছে। তারিখঃ ${dateBn}`;
        } else {
            comment = `<i class="fas fa-edit"></i> সদস্য নির্বাচন করুন এবং জরিমানার পরিমাণ লিখুন`;
        }
    } else if (type === "profit" || type === "expense" || type === "loss") {
        const desc = document.getElementById("tx-desc-text")?.value || "";
        const amount = document.getElementById("tx-amount")?.value || "";
        const amountBn = amount ? toBengaliNum(amount) : "";
        const dateVal = document.getElementById("tx-date")?.value;
        const dateBn = formatBengaliDate(dateVal);
        const typeLabel = type === "profit" ? "আয়" : type === "expense" ? "খরচ" : "ক্ষতি";
        
        if (desc && amount) {
            comment = `<i class="fas fa-calculator"></i> ${desc} এর জন্য ${amountBn} টাকা ${typeLabel} রেকর্ড করা হচ্ছে। তারিখঃ ${dateBn}`;
        } else {
            comment = `<i class="fas fa-edit"></i> বিবরণ এবং পরিমাণ প্রদান করুন`;
        }
    }
    
    commentEl.innerHTML = comment;
}

// Add event listeners for dynamic comment in transaction modal
function initTxDynamicComment() {
    const fields = ["tx-type", "tx-desc-select", "tx-desc-text", "tx-target-month", "tx-target-year", "tx-amount", "tx-date"];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("change", updateTxDynamicComment);
            el.addEventListener("input", updateTxDynamicComment);
        }
    });
}

function populateActiveLoans() {
    const loanSelect = document.getElementById("tx-loan-select");
    if (!loanSelect) return;
    
    const loanGroups = {};
    appState.transactions.forEach(tx => {
        if (tx.type === "loan_given") {
            loanGroups[tx.desc] = (loanGroups[tx.desc] || 0) + tx.amount;
        } else if (tx.type === "loan_repaid") {
            loanGroups[tx.desc] = (loanGroups[tx.desc] || 0) - tx.amount;
        }
    });
    
    const activeLoans = Object.keys(loanGroups)
        .map(desc => ({ desc, amount: loanGroups[desc] }))
        .filter(l => l.amount > 0);
    
    if (activeLoans.length === 0) {
        loanSelect.innerHTML = `<option value="">কোনো বকেয়া ঋণ নেই</option>`;
        document.getElementById("tx-amount").value = "";
    } else {
        loanSelect.innerHTML = activeLoans.map(l =>
            `<option value="${l.desc}" data-amount="${l.amount}">${l.desc} (বকেয়া: ${fmtCurrency(l.amount)})</option>`
        ).join("");
        handleLoanSelection(); // অটোমেটিক টাকার পরিমাণ বসিয়ে দেবে
    }
}

// নতুন ফাংশন: ঋণ সিলেক্ট করলে অটোমেটিক টাকার বক্সে বকেয়া এমাউন্ট বসানো
function handleLoanSelection() {
    const select = document.getElementById("tx-loan-select");
    if (select && select.options.length > 0 && select.value !== "") {
        const amount = select.options[select.selectedIndex].getAttribute("data-amount");
        document.getElementById("tx-amount").value = amount;
    }
}




function openConfirm(t, m, c) { document.getElementById("confirm-title").textContent = t; document.getElementById("confirm-message").textContent = m; confirmCallback = c; document.getElementById("confirm-modal").classList.add("active"); }
function closeConfirm() { document.getElementById("confirm-modal").classList.remove("active"); confirmCallback = null; }
// আগের ইভেন্ট লিসেনার মুছে নতুনটি সেট করা হলো যেন সাথে সাথে মডাল বন্ধ হয়
const confirmBtn = document.getElementById("confirm-yes-btn");
const newConfirmBtn = confirmBtn.cloneNode(true);
confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

newConfirmBtn.addEventListener("click", () => {
    const callback = confirmCallback;
    closeConfirm(); // কাজ শুরু হওয়ার আগেই নিশ্চিতকরণ মডালটি বন্ধ করবে
    if (callback) {
        setTimeout(() => { callback(); }, 50); // ব্যাকগ্রাউন্ডে ডেটা প্রসেস করবে
    }
});

document.getElementById("tx-form").addEventListener("submit", e => {
    e.preventDefault();
    const type = document.getElementById("tx-type").value;
    const amount = parseFloat(document.getElementById("tx-amount").value);
    const dtVal = document.getElementById("tx-date").value;
    
    // Audit #3: Use YYYY-MM-DD local format to avoid timezone shifts
    const todayStr = new Date().toLocaleDateString('en-CA');
    const date = dtVal || todayStr;
    
    if (!amount || amount <= 0) return showToast("সঠিক পরিমাণ লিখুন", true);
    
    // 🖊️ Edit Mode: If editing, handle update instead of create
    if (editingTxId) {
        // Get original transaction to calculate amount difference
        let originalTx = null;
        let isDepositEdit = false;
        if (editingTxType === "deposit") {
            originalTx = (appState.depositHistory || []).find(x => x.id === editingTxId);
            isDepositEdit = true;
        } else {
            originalTx = (appState.transactions || []).find(x => x.id === editingTxId);
        }
        
        if (!originalTx) {
            showToast("পুরানো লেনদেন পাওয়া যায়নি", true);
            editingTxId = null;
            editingTxType = null;
            return;
        }
        
        const amountDiff = amount - (originalTx.amount || 0);
        
        // Update the transaction
        originalTx.amount = amount;
        originalTx.date = date;
        
        if (isDepositEdit) {
            // Update member's deposited amount
            const member = appState.members.find(m => m.id === originalTx.memberId);
            if (member) {
                member.deposited = (member.deposited || 0) + amountDiff;
                if (member.deposited < 0) member.deposited = 0;
            }
            // Update target month/year
            originalTx.targetMonth = parseInt(document.getElementById("tx-target-month").value);
            originalTx.targetYear = parseInt(document.getElementById("tx-target-year").value);
            const tMonth = originalTx.targetMonth;
            const tYear = originalTx.targetYear;
            const mStr = bengaliMonths[tMonth];
            const yStr = toBengaliNum(tYear);
            originalTx.desc = `${member?.name || originalTx.memberName} - ${mStr} ${yStr} এর জমা`;
        } else if (type === "fine") {
            originalTx.desc = document.getElementById("tx-desc-text").value.trim();
        } else if (type === "loan_repaid") {
            originalTx.desc = document.getElementById("tx-loan-select")?.value || "";
        } else {
            originalTx.desc = document.getElementById("tx-desc-text").value.trim();
        }
        
        showToast("লেনদেন আপডেট হয়েছে");
        editingTxId = null;
        editingTxType = null;
        saveData();
        refreshUI();
        closeModal();
        return;
    } else if (type === "deposit") {
        const id = parseInt(document.getElementById("tx-desc-select").value);
        const member = appState.members.find(m => m.id === id);
        if (member) {
            member.deposited += amount;
            if (!appState.depositHistory) appState.depositHistory = [];
            
            // New Dual Date Tracking
            const tMonth = parseInt(document.getElementById("tx-target-month").value);
            const tYear = parseInt(document.getElementById("tx-target-year").value);
            
            const mStr = bengaliMonths[tMonth];
            const yStr = toBengaliNum(tYear);
            const depositDesc = `${member.name} - ${mStr} ${yStr} এর জমা`;
            
            appState.depositHistory.push({ 
                id: Date.now(), 
                memberId: member.id, 
                memberName: member.name, 
                desc: depositDesc, 
                amount, 
                date, // Actual payment date
                targetMonth: tMonth,
                targetYear: tYear
            });
            showToast(`${member.name} - জমা সফল`);
        }
    } else if (type === "loan_repaid") {
        const loanSelect = document.getElementById("tx-loan-select");
        if (!loanSelect || !loanSelect.value) return showToast("কোনো চলমান ঋণ নির্বাচন করা হয়নি", true);
        const desc = loanSelect.value;
        appState.transactions.push({ id: Date.now(), type, desc, amount, date });
        showToast("ঋণ ফেরত রেকর্ড করা হয়েছে");
    } else if (type === "loan_given") {
        const desc = document.getElementById("tx-desc-text").value.trim();
        if (!desc) return showToast("সদস্যের নাম বা বিবরণ লিখুন", true);
        
        // Audit #5: Expense/Loan Guard - check liquid balance
        if (amount > financialMetrics.liquidCash) {
            return showToast(`পর্যাপ্ত ব্যালেন্স নেই! বর্তমান ক্যাশ: ${fmtCurrency(financialMetrics.liquidCash)}`, true);
        }
        
        appState.transactions.push({ id: Date.now(), type, desc, amount, date });
        showToast("ঋণ প্রদানের রেকর্ড সফল");
    } else if (type === "fine") {
        // জরিমানার ক্ষেত্রে মেম্বারের নাম এবং ঐচ্ছিক টেক্সট সংযুক্ত করা
        const id = parseInt(document.getElementById("tx-desc-select").value);
        const member = appState.members.find(m => m.id === id);
        const extraDesc = document.getElementById("tx-desc-text").value.trim();
        const desc = member ? `${member.name} - ${extraDesc || "জরিমানা"}` : extraDesc || "জরিমানা";
        
        appState.transactions.push({ id: Date.now(), type, desc, amount, date });
        showToast("জরিমানা রেকর্ড করা হয়েছে");
    } else {
        const desc = document.getElementById("tx-desc-text").value.trim();
        if (!desc) return showToast("বিবরণ লিখুন", true);
        
        // Audit #5: Expense Guard for direct expenses and losses
        if ((type === "expense" || type === "loss") && amount > financialMetrics.liquidCash) {
            return showToast(`পর্যাপ্ত ব্যালেন্স নেই! বর্তমান ক্যাশ: ${fmtCurrency(financialMetrics.liquidCash)}`, true);
        }

        appState.transactions.push({ id: Date.now(), type, desc, amount, date });
        showToast(`${typeTranslations[type]} রেকর্ড করা হয়েছে`);
    }
    
    saveData();
    refreshUI();
    closeModal();
});

function editTransaction(id, type, e) {
  if (e) e.stopPropagation();
  editingTxId = id;
  editingTxType = type;
  
  // Find the transaction
  let tx = null;
  let isDeposit = false;
  if (type === "deposit") {
    tx = (appState.depositHistory || []).find(x => x.id === id);
    isDeposit = true;
  } else {
    tx = (appState.transactions || []).find(x => x.id === id);
  }
  
  if (!tx) return showToast("লেনদেন পাওয়া যায়নি", true);
  
  // Open modal with type pre-selected
  openModal(type);
  
  // Update modal title to show edit mode
  const modalTitle = document.getElementById("modal-title");
  if (modalTitle) modalTitle.innerHTML = `<i class="fas fa-edit"></i> সম্পাদনা করুন`;
  
  // Pre-fill form fields
  document.getElementById("tx-amount").value = tx.amount;
  document.getElementById("tx-date").value = tx.date ? tx.date.split("T")[0] : "";
  
  if (isDeposit) {
    // For deposits, set member select
    const memberSelect = document.getElementById("tx-desc-select");
    if (memberSelect && tx.memberId) memberSelect.value = tx.memberId;
    // Set target month/year
    if (tx.targetMonth !== undefined) document.getElementById("tx-target-month").value = tx.targetMonth;
    if (tx.targetYear !== undefined) document.getElementById("tx-target-year").value = tx.targetYear;
  } else if (type === "fine") {
    // For fines, set member and description
    const memberSelect = document.getElementById("tx-desc-select");
    if (memberSelect && tx.memberId) memberSelect.value = tx.memberId;
    document.getElementById("tx-desc-text").value = tx.desc || "";
  } else if (type === "loan_repaid") {
    // For loan repayments, populate and select the loan
    populateActiveLoans();
    const loanSelect = document.getElementById("tx-loan-select");
    if (loanSelect) loanSelect.value = tx.desc || "";
  } else {
    // For other types (loan_given, expense, profit, loss)
    document.getElementById("tx-desc-text").value = tx.desc || "";
  }
  
  // Scroll to top of modal
  document.getElementById("tx-modal").scrollTop = 0;
  showToast("সম্পাদনা মোড চালু");
}

function deleteTransaction(id, type, e) {
  if (e) e.stopPropagation();
  openConfirm("লেনদেন মুছুন?", "আপনি কি নিশ্চিত?", () => {
    if (type === "deposit") {
      const d = (appState.depositHistory || []).find(x => x.id === id);
      if (d) { const m = appState.members.find(x => x.id === d.memberId); if(m) { m.deposited -= d.amount; if(m.deposited<0) m.deposited=0; } appState.depositHistory = appState.depositHistory.filter(x => x.id !== id); }
    } else appState.transactions = appState.transactions.filter(x => x.id !== id);
    saveData(); refreshUI(); showToast("লেনদেন মুছে ফেলা হয়েছে");
  });
}

function addMember() {
  const name = document.getElementById("new-member-name").value.trim(),
        nameEn = document.getElementById("new-member-name-en").value.trim(),
        phone = document.getElementById("new-member-phone")?.value || "",
        email = document.getElementById("new-member-email")?.value.trim() || "",
        dep = parseFloat(document.getElementById("new-member-deposit").value) || 0;
  
  if (!name) return showToast("সদস্যের নাম লিখুন", true);
  
  const newId = appState.members.length > 0 ? Math.max(...appState.members.map(m => m.id)) + 1 : 1;
  const dDate = document.getElementById("new-member-date")?.value || new Date().toISOString().split("T")[0];
  
  appState.members.push({ 
    id: newId, 
    name, 
    englishName: nameEn,
    email,
    deposited: dep, 
    phone, 
    openingDate: dDate 
  });
  
  if (dep > 0) {
    if (!appState.depositHistory) appState.depositHistory = [];
    appState.depositHistory.push({ id: Date.now(), memberId: newId, memberName: name, desc: `${name} - প্রারম্ভিক জমা`, amount: dep, date: new Date().toISOString() });
  }
  
  saveData(); refreshUI(); loadSettings();
  
  // Clear inputs
  document.getElementById("new-member-name").value = "";
  document.getElementById("new-member-name-en").value = "";
  document.getElementById("new-member-phone").value = "";
  document.getElementById("new-member-email").value = "";
  document.getElementById("new-member-deposit").value = "0";
  
  showToast("সদস্য যুক্ত হয়েছে");
}

// Audit #4: Member Archiving with Automated Clearance
let currentClearanceMemberId = null;

function removeMember() {
  const id = parseInt(document.getElementById("remove-member-select").value), member = appState.members.find(m => m.id === id);
  if (!member) return showToast("সদস্য নির্বাচন করুন", true);
  
  // Calculate current payout before archiving: Equity = (Cash Deposited + Profit Earned)
  calculateFinances();
  const mData = financialMetrics.processedMembers.find(m => m.id === id);
  const payout = mData.deposited + (mData.finalProfitShare || 0);

  // Instead of archiving now, we show the modal for final review
  showClearanceSummary(id, true);
}

function showClearanceSummary(memberId, isPending = false) {
    const m = appState.members.find(mbr => mbr.id === memberId);
    if (!m) return;
    
    currentClearanceMemberId = memberId;
    
    // We need the calculated metrics
    calculateFinances();
    const metrics = financialMetrics.processedMembers.find(mbr => mbr.id === memberId);
    if (!metrics) return;

    document.getElementById("cs-member-name").textContent = m.name;
    document.getElementById("cs-member-id").textContent = toBengaliNum(m.id);
    document.getElementById("cs-join-date").textContent = fmtDate(m.openingDate);
    document.getElementById("cs-close-date").textContent = fmtDate(new Date());
    
    document.getElementById("cs-total-deposited").textContent = fmtCurrency(metrics.deposited);
    document.getElementById("cs-total-profit").textContent = fmtCurrency(metrics.finalProfitShare);
    
    // UI adjustment: Show dues row only if balance > 0
    const dueRow = document.getElementById("cs-due-row");
    if (metrics.dueAmount > 0) {
        dueRow.style.display = "flex";
        document.getElementById("cs-total-due").textContent = fmtCurrency(metrics.dueAmount);
    } else {
        dueRow.style.display = "none";
    }
    
    // Final Payout is their contributed equity + allocated profit (fixed previous negative issue)
    const finalPayout = Math.max(0, metrics.deposited + (metrics.finalProfitShare || 0));
    document.getElementById("cs-final-payout").textContent = fmtCurrency(finalPayout);
    document.getElementById("cs-print-date").textContent = `তারিখ: ${new Date().toLocaleDateString('bn-BD', {year:'numeric', month:'long', day:'numeric'})}`;

    // Update Status UI
    const banner = document.getElementById("cs-status-banner");
    const msgArea = document.getElementById("cs-status-msg-area");
    const actionsArea = document.getElementById("cs-modal-actions");

    if (isPending) {
        banner.textContent = "পেন্ডিং";
        banner.className = "clearance-status-banner status-banner-pending";
        msgArea.innerHTML = `
            <div class="cs-header-alert cs-alert-pending">
                <i class="fas fa-info-circle"></i>
                <span>সদস্য অপসারণ এখনো নিশ্চিত করা হয়নি।</span>
            </div>
        `;
        actionsArea.innerHTML = `
            <button class="see-all-btn btn-cancel" onclick="closeClearanceSummary()" style="border:1px solid #ccc; background:#eee;">বাতিল</button>
            <button class="btn-submit" onclick="exportClearanceJPG()" style="margin:0; background:#64748b;"><i class="fas fa-file-image"></i> ড্রাফ্ট ইমেজ</button>
            <button class="btn-action btn-danger-action" onclick="finalizeMemberRemoval(${m.id})" style="margin:0;"><i class="fas fa-user-minus"></i> চূড়ান্ত অপসারণ</button>
        `;
    } else {
        banner.textContent = "নিশ্চিত";
        banner.className = "clearance-status-banner status-banner-confirmed";
        msgArea.innerHTML = `
            <div class="cs-header-alert cs-alert-confirmed">
                <i class="fas fa-check-circle"></i>
                <span>সদস্য সফলভাবে অপসারণ ও হিসাব ক্লোজ করা হয়েছে।</span>
            </div>
        `;
        actionsArea.innerHTML = `
            <button class="btn-cancel" onclick="closeClearanceSummary()" style="padding: 10px;">বন্ধ করুন</button>
            <button class="btn-submit" onclick="exportClearanceJPG()" style="margin-top: 0; padding: 10px;">
              <i class="fas fa-file-image"></i> ইমেজ নামান (JPG)
            </button>
        `;
    }

    document.getElementById("clearance-summary-modal").classList.add("active");
}

function finalizeMemberRemoval(memberId) {
    const member = appState.members.find(m => m.id === memberId);
    if (!member) return;

    calculateFinances();
    const mData = financialMetrics.processedMembers.find(m => m.id === memberId);
    const payout = Math.max(0, mData.deposited + (mData.finalProfitShare || 0));

    // Perform actual archiving
    member.archived = true;
    member.archivedDate = new Date().toISOString();
    member.finalPayout = payout;
    
    // Create clearance log
    if (!appState.clearanceLogs) appState.clearanceLogs = [];
    appState.clearanceLogs.push({
        id: Date.now(),
        memberId: member.id,
        memberName: member.name,
        joiningDate: member.openingDate,
        principal: mData.deposited,
        profit: mData.finalProfitShare || 0,
        totalPowed: payout,
        paidAmount: 0,
        status: 'pending',
        history: [],
        date: member.archivedDate
    });

    saveData();
    refreshUI();
    loadSettings();
    
    // Update modal to confirmed state
    showClearanceSummary(memberId, false);
    showToast("সদস্য অপসারণ নিশ্চিত করা হয়েছে");

    // Auto export professional report after a short delay
    setTimeout(() => {
        const latestLog = appState.clearanceLogs.find(l => l.memberId === memberId && l.date === member.archivedDate);
        if (latestLog) {
            generateProfessionalReport(latestLog, true);
        }
    }, 800);
}

function closeClearanceSummary() {
    document.getElementById("clearance-summary-modal").classList.remove("active");
}

function exportClearanceJPG(isAuto = false) {
    if (!currentClearanceMemberId) return;
    
    // Find if it's already a log (confirmed) or needs a temporary log (draft)
    const existingLog = appState.clearanceLogs?.find(l => l.memberId === currentClearanceMemberId && !appState.members.find(m => m.id === currentClearanceMemberId && !m.archived));
    
    if (existingLog) {
        generateProfessionalReport(existingLog, isAuto);
        return;
    }

    // Otherwise synthesize a "Draft" log
    const member = appState.members.find(m => m.id === currentClearanceMemberId);
    if (!member) return;
    
    calculateFinances();
    const mData = financialMetrics.processedMembers.find(m => m.id === currentClearanceMemberId);
    if (!mData) return;

    const draftLog = {
        memberName: member.name,
        memberId: member.id,
        joiningDate: member.openingDate,
        date: new Date().toISOString(),
        principal: mData.deposited,
        profit: mData.finalProfitShare || 0,
        totalPowed: Math.max(0, mData.deposited + (mData.finalProfitShare || 0)),
        paidAmount: 0,
        history: [],
        isDraft: true // Visual hint if needed
    };

    generateProfessionalReport(draftLog, isAuto);
}

function renderClearanceLog() {
    const container = document.getElementById("clearance-log-list");
    if (!container) return;
    
    const logs = appState.clearanceLogs || [];
    if (logs.length === 0) {
        container.innerHTML = renderEmptyState("fas fa-file-invoice", "কোনো ক্লিয়ারেন্স রেকর্ড নেই");
        return;
    }

    container.innerHTML = logs.sort((a,b) => b.id - a.id).map(log => {
        const absPowed = Math.abs(log.totalPowed);
        const absPaid = Math.abs(log.paidAmount);
        const remaining = Math.max(0, absPowed - absPaid);
        const statusClass = remaining <= 0 ? "status-completed" : "status-pending";
        
        return `
            <div class="log-item animate-in" onclick="openClearanceDetail(${log.id})" style="cursor:pointer;">
                <div class="log-info" style="flex:1;">
                    <h4>${log.memberName}</h4>
                    <p>মোট পাওনা: <b>${fmtCurrency(absPowed)}</b> | প্রদেয়: <b>${fmtCurrency(absPaid)}</b></p>
                    <p style="font-size:0.7rem;">তারিখ: ${fmtDate(log.date)}</p>
                </div>
                <div style="text-align:right;">
                    <span class="log-status ${statusClass}">${remaining <= 0 ? 'পরিশোধিত' : 'প্রদান বাকি'}</span>
                    <h4 style="margin-top:5px; color:${remaining <= 0 ? 'var(--primary)' : 'var(--danger)'}">
                        ${remaining > 0 ? fmtCurrency(remaining) : '৳০'}
                    </h4>
                    <span class="see-all-btn" style="margin-top:5px; font-size:0.7rem;">
                        বিস্তারিত দেখুন <i class="fas fa-chevron-right"></i>
                    </span>
                </div>
            </div>
        `;
    }).join("");
}

let activeDetailLogId = null;

function openClearanceDetail(logId) {
    const log = appState.clearanceLogs.find(l => l.id === logId);
    if (!log) return;
    
    activeDetailLogId = logId;

    document.getElementById("cd-member-name").textContent = log.memberName;
    document.getElementById("cd-member-id").textContent = toBengaliNum(log.memberId);
    
    // Detailed Info
    document.getElementById("cd-join-date").textContent = fmtDate(log.joiningDate || log.date);
    document.getElementById("cd-close-date").textContent = fmtDate(log.date);
    document.getElementById("cd-duration").textContent = getDurationLabel(log.joiningDate || log.date, log.date);
    document.getElementById("cd-principal").textContent = fmtCurrency(log.principal || 0);
    document.getElementById("cd-profit").textContent = fmtCurrency(log.profit || 0);

    const absPowed = Math.abs(log.totalPowed);
    const absPaid = Math.abs(log.paidAmount);
    const remaining = Math.max(0, absPowed - absPaid);

    document.getElementById("cd-payout-equity").textContent = fmtCurrency(absPowed);
    document.getElementById("cd-paid-so-far").textContent = fmtCurrency(absPaid);
    document.getElementById("cd-remaining-balance").textContent = fmtCurrency(remaining);
    document.getElementById("cd-record-date").textContent = `রেকর্ড তৈরির তারিখ: ${fmtDate(log.date)}`;

    renderClearancePaymentHistory(log);
    
    document.getElementById("clearance-detail-modal").classList.add("active");
}

function closeClearanceDetail() {
    document.getElementById("clearance-detail-modal").classList.remove("active");
    activeDetailLogId = null;
}

function renderClearancePaymentHistory(log) {
    const list = document.getElementById("cd-payout-history");
    const history = log.history || [];
    
    if (history.length === 0) {
        list.innerHTML = `<p style="font-size:0.75rem; color:var(--text-muted); text-align:center;">কোনো পেমেন্ট পরিশোধ করা হয়নি</p>`;
        return;
    }

    list.innerHTML = history.map(item => `
        <div class="payout-history-item">
            <span class="phi-date">${fmtDate(item.date)}</span>
            <span class="phi-amount">+ ${fmtCurrency(item.amount)}</span>
        </div>
    `).join("");
}

function addClearancePaymentDetail() {
    if (!activeDetailLogId) return;
    const input = document.getElementById("cd-new-payment");
    const amount = parseFloat(input.value);
    
    if (isNaN(amount) || amount <= 0) return showToast("সঠিক পরিমাণ লিখুন", true);
    
    const log = appState.clearanceLogs.find(l => l.id === activeDetailLogId);
    const remaining = log.totalPowed - log.paidAmount;
    
    if (amount > remaining) {
        if (!confirm(`আপনি পাওনার চেয়ে বেশি টাকা (${fmtCurrency(amount)}) দিতে চাচ্ছেন। নিশ্চিত?`)) return;
    }

    log.paidAmount += amount;
    if (!log.history) log.history = [];
    log.history.push({ date: new Date().toISOString(), amount });
    
    if (log.paidAmount >= log.totalPowed) log.status = 'completed';
    
    input.value = "";
    saveData();
    refreshUI();
    openClearanceDetail(activeDetailLogId); // Refresh modal view
    showToast("পেমেন্ট সফলভাবে যোগ করা হয়েছে");
}

function deleteClearanceLogDetail() {
    if (!activeDetailLogId) return;
    
    openConfirm(
        "এই লগটি ডিলিট করবেন?",
        "এই সদস্যের ক্লিয়ারেন্স রেকর্ড স্থায়ীভাবে মুছে যাবে। আপনি কি নিশ্চিত?",
        () => {
            appState.clearanceLogs = appState.clearanceLogs.filter(l => l.id !== activeDetailLogId);
            saveData();
            closeClearanceDetail();
            refreshUI();
            showToast("লগ মুছে ফেলা হয়েছে");
        }
    );
}

function exportClearanceDetailJPG() {
    if (!activeDetailLogId) return;
    const log = appState.clearanceLogs.find(l => l.id === activeDetailLogId);
    if (!log) return;
    generateProfessionalReport(log);
}

function exportActiveMemberReport(memberId) {
    const m = financialMetrics;
    const member = m.processedMembers.find(mbr => mbr.id === memberId);
    if (!member) return;

    const profitShare = member.finalProfitShare || 0;
    const individualEquity = member.deposited + profitShare;

    // Year-wise Due Summary Calculation (Mirroring openDueSummary logic)
    const monthlyInstallment = appState.config?.monthlyInstallment || 1000;
    const annualBooster = appState.config?.annualBooster || 5000;
    const globalStart = new Date(appState.config?.fundStartDate || "2025-01-01");
    let joinDate = new Date(member.openingDate || "2025-01-01");
    if(isNaN(joinDate)) joinDate = new Date("2025-01-01");
    let effectiveDate = joinDate > globalStart ? joinDate : globalStart;

    const memberDeposits = (appState.depositHistory || []).filter(d => d.memberId === member.id);
    const slots = {};
    memberDeposits.forEach(d => {
        const target = getDepositTarget(d);
        slots[`${target.year}-${target.month}`] = (slots[`${target.year}-${target.month}`] || 0) + d.amount;
    });

    let yearSummaries = [];
    const startYear = effectiveDate.getFullYear();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    for (let year = startYear; year <= currentYear; year++) {
        let months = [];
        let sMonth = (year === startYear) ? effectiveDate.getMonth() : 0;
        let eMonth = (year === currentYear) ? currentMonth : 11;
        let yearHasMonths = false;

        for (let mo = 0; mo < 12; mo++) {
            const key = `${year}-${mo}`;
            const isDueRange = !(mo < sMonth || (year === currentYear && mo > eMonth) || year < startYear);
            if(isDueRange) {
                yearHasMonths = true;
                months.push({
                    month: mo,
                    paid: slots[key] || 0,
                    isPaid: (slots[key] || 0) >= monthlyInstallment
                });
            }
        }

        if (yearHasMonths) {
            const boosterPaidTotal = memberDeposits.filter(d => {
                const target = getDepositTarget(d);
                return target.year === year && (d.desc && d.desc.toLowerCase().includes("boost"));
            }).reduce((sum, d) => sum + d.amount, 0);

            yearSummaries.push({
                year: year,
                months: months,
                booster: annualBooster > 0 ? {
                    amount: annualBooster,
                    paid: boosterPaidTotal,
                    isPaid: boosterPaidTotal >= annualBooster
                } : null
            });
        }
    }

    // Synthesize report payload
    const draftLog = {
        id: memberId,
        memberId: member.id,
        memberName: member.name,
        date: new Date().toISOString(),
        joiningDate: member.openingDate,
        principal: member.deposited,
        profit: profitShare,
        totalPowed: individualEquity,
        paidAmount: 0, 
        status: 'active',
        penaltyPercent: member.penaltyPercent || 0,
        totalLateDays: member.totalLateDays || 0,
        penaltyAmount: member.penaltyAmount || 0,
        dueAmount: member.dueAmount || 0,
        yearSummaries: yearSummaries,
        history: memberDeposits
            .sort((a,b) => new Date(b.date) - new Date(a.date))
            .slice(0, 5) // Limit history to save space
            .map(d => ({ date: d.date, amount: d.amount, desc: d.desc }))
    };

    generateProfessionalReport(draftLog);
}

function generateProfessionalReport(log, isAuto = false) {
    if (!log) return;
    const isActive = log.status === 'active';

    // 1. Populate Hidden A4 Template
    document.getElementById("a4-fund-title").textContent = appState.config?.fundName || "সমবায় ফান্ড প্রো";
    document.getElementById("a4-name").textContent = log.memberName;
    document.getElementById("a4-id").textContent = toBengaliNum(log.memberId);
    document.getElementById("a4-join-date").textContent = fmtDate(log.joiningDate || log.date);
    document.getElementById("a4-close-date").textContent = fmtDate(log.date);
    document.getElementById("a4-duration").textContent = getDurationLabel(log.joiningDate || log.date, log.date);
    
    // UI Label Tweaks for Active vs Removed
    const docTitle = document.querySelector("#a4-clearance-template h2");
    if (docTitle) docTitle.textContent = isActive ? "সদস্যের বর্তমান হিসাব বিবরণী" : "সদস্যের চূড়ান্ত হিসাব ও ক্লোজিং রিপোর্ট";
    
    document.getElementById("a4-principal").textContent = fmtCurrency(Math.abs(log.principal || 0));
    document.getElementById("a4-profit").textContent = fmtCurrency(Math.abs(log.profit || 0));
    document.getElementById("a4-total-equity").textContent = fmtCurrency(Math.abs(log.totalPowed));
    
    const labelPaid = document.getElementById("a4-label-paid-so-far");
    const labelRem = document.getElementById("a4-label-remaining");
    
    document.getElementById("a4-paid-so-far").textContent = fmtCurrency(Math.abs(log.paidAmount));
    const rem = Math.max(0, log.totalPowed - log.paidAmount);
    document.getElementById("a4-remaining").textContent = fmtCurrency(rem);
    
    // Dynamic Labels for Active vs Removed
    document.getElementById("a4-label-close-date").textContent = isActive ? "রিপোর্ট প্রদানের তারিখ:" : "বিদায় গ্রহণের তারিখ:";
    document.getElementById("a4-status-text").textContent = isActive ? "সদস্যপদ সক্রিয়" : "সদস্যপদ সমাপ্ত";
    document.getElementById("a4-status-text").style.color = isActive ? "var(--primary)" : "var(--primary-dark)";
    
    if (labelPaid) labelPaid.textContent = isActive ? "মোট উত্তোলিত (ইতিমধ্যে)" : "ইতিপূর্বে পরিশোধিত";
    if (labelRem) labelRem.textContent = isActive ? "নিট পাওনা (সবশেষে)" : "অবশিষ্ট পাওনা";
    
    // Watermark
    const wm = document.getElementById("a4-watermark-text");
    if (isActive) {
        wm.textContent = "ACTIVE";
        wm.style.color = "#eff6ff"; // Light blue for active
    } else {
        wm.textContent = rem <= 0 ? "PAID" : "PENDING";
        wm.style.color = rem <= 0 ? "#ecfdf5" : "#fff1f2";
    }

    // Discipline & penalty
    const disciplineSection = document.getElementById("a4-discipline-section");
    if (disciplineSection) {
        if (log.penaltyPercent !== undefined) {
            disciplineSection.style.display = "block";
            document.getElementById("a4-discipline-bar").style.width = `${Math.min(log.penaltyPercent, 100)}%`;
            document.getElementById("a4-discipline-pct").textContent = `${toBengaliNum((log.penaltyPercent).toFixed(2))}%`;
            document.getElementById("a4-delayed-days").textContent = `${toBengaliNum(log.totalLateDays || 0)} দিন`;
            document.getElementById("a4-cut-amount").textContent = fmtCurrency(log.penaltyAmount || 0);
        } else {
            disciplineSection.style.display = "none";
        }
    }

    // Year-wise Due Details
    const dueContainer = document.getElementById("a4-due-years-container");
    if (dueContainer && log.yearSummaries) {
        dueContainer.innerHTML = log.yearSummaries.map(ys => `
            <div style="margin-bottom: 12px;">
                <div style="font-size: 0.8rem; font-weight: 700; color: #475569; margin-bottom: 5px; display: flex; align-items: center; gap: 5px;">
                    <i class="fas fa-calendar-alt"></i> ${toBengaliNum(ys.year)} সালের কিস্তি পরিস্থিতি
                </div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; border: 1px solid #f1f5f9; padding: 6px; border-radius: 6px; background: #fff;">
                    ${ys.months.map(m => `
                        <div style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; border: 1px solid ${m.isPaid ? '#dcfce7' : '#fee2e2'}; background: ${m.isPaid ? '#f0fdf4' : '#fef2f2'}; color: ${m.isPaid ? '#166534' : '#b91c1c'};">
                            ${m.isPaid ? '✅' : '❌'} ${bengaliMonths[m.month].substring(0,3)}
                        </div>
                    `).join("")}
                    ${ys.booster ? `
                        <div style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; border: 1px solid ${ys.booster.isPaid ? '#e0f2fe' : '#fff7ed'}; background: ${ys.booster.isPaid ? '#f0f9ff' : '#fff7ed'}; color: ${ys.booster.isPaid ? '#0369a1' : '#9a3412'}; font-weight: 700;">
                            🚀 বুস্টার ${ys.booster.isPaid ? 'OK' : 'DUE'}
                        </div>
                    ` : ""}
                </div>
            </div>
        `).join("");
    } else if (dueContainer) {
        dueContainer.innerHTML = `<p style="font-size: 0.75rem; color: #94a3b8; font-style: italic;">সক্রিয় সদস্যদের জন্য বকেয়া বিবরণ উপলব্ধ।</p>`;
    }

    // Payment Rows
    const tbody = document.getElementById("a4-payment-rows");
    const history = log.history || [];
    const tableHeaderDesc = document.querySelector("#a4-clearance-template thead th:nth-child(3)");
    if(tableHeaderDesc) tableHeaderDesc.textContent = isActive ? "বিবরণ (সর্বশেষ ১০টি)" : "বিবরণ";

    if (history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#999;">কোনো রেকর্ড পাওয়া যায়নি</td></tr>`;
    } else {
        tbody.innerHTML = history.map((item, idx) => `
            <tr>
                <td>${toBengaliNum(idx + 1)}</td>
                <td>${fmtDate(item.date)}</td>
                <td>${item.desc || (isActive ? "সদস্য জমা" : "সদস্য অপসারণ কিস্তি পরিশোধ")}</td>
                <td style="text-align:right; font-weight:700;">${fmtCurrency(item.amount)}</td>
            </tr>
        `).join("");
    }

    const fLabel1 = document.getElementById("a4-footer-label-1");
    const fValue1 = document.getElementById("a4-footer-val-1");
    const fLabel2 = document.getElementById("a4-footer-label-2");
    const fValue2 = document.getElementById("a4-footer-val-2");
    const fLabel3 = document.getElementById("a4-footer-label-3");
    const fValue3 = document.getElementById("a4-footer-val-3");

    if (isActive) {
        fLabel1.textContent = "মোট আমানত/জমা";
        fValue1.textContent = fmtCurrency(log.principal || 0);
        fLabel1.style.color = "var(--text-main)"; fValue1.style.color = "var(--text-main)";

        fLabel2.textContent = "অর্জিত নিট লভ্যাংশ";
        fValue2.textContent = fmtCurrency(log.profit || 0);
        fLabel2.style.color = "var(--primary)"; fValue2.style.color = "var(--primary)";

        fLabel3.textContent = "মোট বকেয়া (ডিউ)";
        fValue3.textContent = fmtCurrency(log.dueAmount || 0);
        fLabel3.style.color = "var(--danger)"; fValue3.style.color = "var(--danger)";
    } else {
        fLabel1.textContent = "মোট প্রদেয়";
        fValue1.textContent = fmtCurrency(log.totalPowed);
        fLabel1.style.color = "var(--text-main)"; fValue1.style.color = "var(--text-main)";

        fLabel2.textContent = "পরিশোধিত";
        fValue2.textContent = fmtCurrency(log.paidAmount);
        fLabel2.style.color = "#2563eb"; fValue2.style.color = "#2563eb";

        fLabel3.textContent = "বকেয়া (ডিউ)";
        fValue3.textContent = fmtCurrency(rem);
        fLabel3.style.color = "#dc2626"; fValue3.style.color = "#dc2626";
    }

    document.getElementById("a4-print-date").textContent = `মুদ্রণ তারিখ: ${fmtDate(new Date())}`;

    // 2. Capture the template
    const template = document.getElementById("a4-clearance-template");
    
    if(!isAuto) showToast("অফিসিয়াল রিপোর্ট তৈরি হচ্ছে...");
    
    html2canvas(template, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        windowWidth: 800,
        windowHeight: 1125
    }).then(canvas => {
        const link = document.createElement("a");
        link.download = `Official_Report_${log.memberName}_${new Date().toISOString().split('T')[0]}.jpg`;
        link.href = canvas.toDataURL("image/jpeg", 0.95);
        link.click();
        if(!isAuto) showToast("অফিসিয়াল রিপোর্ট ডাউনলোড হয়েছে");
    }).catch(err => {
        console.error("Export error", err);
        if(!isAuto) showToast("ইমেজ তৈরিতে সমস্যা হয়েছে", true);
    });
}

function manageClearancePayment(logId) {
    const log = appState.clearanceLogs.find(l => l.id === logId);
    if (!log) return;
    
    const remaining = log.totalPowed - log.paidAmount;
    const promptMsg = `${log.memberName} এর মোট পাওনা ${fmtCurrency(log.totalPowed)}। ইতিপূর্বে দেয়া হয়েছে ${fmtCurrency(log.paidAmount)}। বাকি আছে ${fmtCurrency(remaining)}। কত টাকা প্রদান করলেন?`;
    
    const val = prompt(promptMsg, remaining);
    if (val === null) return;
    
    const amount = parseFloat(val);
    if (isNaN(amount) || amount <= 0) return showToast("সঠিক পরিমাণ লিখুন", true);
    
    if (amount > remaining) {
        if (!confirm(`আপনি পাওনার চেয়ে বেশি টাকা (${fmtCurrency(amount)}) দিতে চাচ্ছেন। নিশ্চিত?`)) return;
    }

    log.paidAmount += amount;
    if (!log.history) log.history = [];
    log.history.push({ date: new Date().toISOString(), amount });
    
    if (log.paidAmount >= log.totalPowed) log.status = 'completed';
    
    saveData();
    refreshUI();
    showToast("পেমেন্ট আপডেট করা হয়েছে");
}

function exportSummaryReportJPG() {
    const m = financialMetrics;
    const isFiltered = currentFilterMode !== "all";
    
    let periodStr = "সর্বকালীন (All Time)";
    if (currentFilterMode === "month") periodStr = `${bengaliMonths[currentFilterMonth]} ${toBengaliNum(currentFilterYear)}`;
    else if (currentFilterMode === "year") periodStr = `${toBengaliNum(currentFilterYear)} (সম্পূর্ণ বছর)`;

    // 1. Populate Template
    document.getElementById("a4-sum-fund-title").textContent = appState.config?.fundName || "সমবায় ফান্ড প্রো";
    document.getElementById("a4-sum-period").textContent = periodStr;
    document.getElementById("a4-sum-print-date").textContent = fmtDate(new Date());
    
    document.getElementById("a4-sum-members").textContent = `${toBengaliNum(m.memberCount)} জন`;
    document.getElementById("a4-sum-deposits").textContent = fmtCurrency(isFiltered ? m.filtered.deposits : m.totalDeposits);
    document.getElementById("a4-sum-revenue").textContent = fmtCurrency(isFiltered ? m.filtered.revenue : m.totalRevenue);
    document.getElementById("a4-sum-expenses").textContent = fmtCurrency(isFiltered ? m.filtered.expenses : m.totalExpenses);
    document.getElementById("a4-sum-net-profit").textContent = fmtCurrency(isFiltered ? m.filtered.netProfit : m.netProfit);
    document.getElementById("a4-sum-per-head").textContent = fmtCurrency(m.profitPerMember);
    
    document.getElementById("a4-sum-liquid").textContent = fmtCurrency(m.liquidCash);
    document.getElementById("a4-sum-equity").textContent = fmtCurrency(m.fundEquity);

    document.getElementById("a4-sum-loan-given").textContent = fmtCurrency(m.loansGiven || 0);
    document.getElementById("a4-sum-loan-repaid").textContent = fmtCurrency(m.loansRepaid || 0);
    document.getElementById("a4-sum-loan-outstanding").textContent = fmtCurrency(m.outstandingLoans || 0);

    // Monthly Rows (Extract same data logic as renderSummary)
    const monthlyData = {};
    [...appState.transactions].forEach(tx => {
        const d = new Date(tx.date); const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        if (!monthlyData[k]) monthlyData[k] = { deposits:0, profit:0, fines:0, expenses:0 };
        if (tx.type === "profit") monthlyData[k].profit += tx.amount;
        if (tx.type === "fine") monthlyData[k].fines += tx.amount;
        if (tx.type === "expense" || tx.type === "loss") monthlyData[k].expenses += tx.amount;
    });
    (appState.depositHistory || []).forEach(d => {
        const dt = new Date(d.date); const k = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`;
        if (!monthlyData[k]) monthlyData[k] = { deposits:0, profit:0, fines:0, expenses:0 };
        monthlyData[k].deposits += d.amount;
    });

    const sortedKeys = Object.keys(monthlyData).sort().reverse().slice(0, 5);
    const tbody = document.getElementById("a4-sum-monthly-rows");
    if (sortedKeys.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">কোনো মাসিক ডেটা নেই</td></tr>`;
    } else {
        tbody.innerHTML = sortedKeys.map(k => {
            const data = monthlyData[k];
            const [y, mm] = k.split("-");
            const net = data.profit + data.fines - data.expenses;
            return `
                <tr>
                    <td>${bengaliMonths[parseInt(mm)-1]} ${toBengaliNum(y)}</td>
                    <td style="text-align:right;">${fmtCurrency(data.deposits)}</td>
                    <td style="text-align:right;">${fmtCurrency(data.profit + data.fines)}</td>
                    <td style="text-align:right; font-weight:700;">${fmtCurrency(net)}</td>
                </tr>
            `;
        }).join("");
    }

    // 2. Capture
    showToast("সামগ্রিক রিপোর্ট তৈরি হচ্ছে...");
    const template = document.getElementById("a4-summary-report-template");
    
    html2canvas(template, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        windowWidth: 800,
        windowHeight: 1125
    }).then(canvas => {
        const link = document.createElement("a");
        link.download = `General_Report_${periodStr.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.jpg`;
        link.href = canvas.toDataURL("image/jpeg", 0.98);
        link.click();
        showToast("রিপোর্ট ডাউনলোড হয়েছে");
    }).catch(err => {
        console.error("Summary Export error", err);
        showToast("ইমেজ তৈরিতে সমস্যা হয়েছে", true);
    });
}

function exportData() {
  try {
    // Ensure we are exporting the most current appState
    const exportObject = {
      ...appState,
      exportVersion: "2.0",
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(exportObject, null, 2)], { type: "application/json" });
    const fileName = `somobay-full-backup-${new Date().toISOString().split("T")[0]}.json`;
    
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    
    showToast("সকল ডেটা (ব্যাকআপ) এক্সপোর্ট হয়েছে");
  } catch (err) {
    console.error("Export failed", err);
    showToast("এক্সপোর্ট করতে সমস্যা হয়েছে", true);
  }
}

function exportDataCSV() {
  try {
    if (typeof XLSX === "undefined") {
      showToast("XLSX লাইব্রেরি লোড হয়নি, পেজ রিলোড করুন", true);
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Members ──
    const memberData = [
      ["ID", "নাম (Name)", "ফোন (Phone)", "যোগদানের তারিখ", "অবস্থা (Status)", "মোট জমা (৳)", "ঋণ ব্যালেন্স (৳)"],
      ...(appState.members || []).map(m => [
        m.id,
        m.name || "",
        m.phone || "",
        (m.joiningDate || "").substring(0, 10),
        m.status || "active",
        m.deposited || 0,
        m.loanBalance || 0
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(memberData), "সদস্য (Members)");

    // ── Sheet 2: Transactions ──
    const txData = [
      ["ID", "তারিখ (Date)", "ধরন (Type)", "পরিমাণ (৳)", "নোট (Note)", "সদস্য ID"],
      ...(appState.transactions || []).map(t => [
        t.id,
        (t.date || "").substring(0, 10),
        typeTranslations[t.type] || t.type || "",
        t.amount || 0,
        t.note || "",
        t.memberId || ""
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txData), "লেনদেন (Transactions)");

    // ── Sheet 3: Deposit History ──
    const depData = [
      ["ID", "সদস্য ID", "তারিখ (Date)", "পরিমাণ (৳)", "লক্ষ্য বছর", "লক্ষ্য মাস"],
      ...(appState.depositHistory || []).map(d => [
        d.id,
        d.memberId,
        (d.date || "").substring(0, 10),
        d.amount || 0,
        d.targetYear || "",
        d.targetMonth !== undefined ? d.targetMonth + 1 : ""
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(depData), "জমার ইতিহাস (Deposits)");

    // ── Sheet 4: Clearance Logs ──
    if (appState.clearanceLogs && appState.clearanceLogs.length > 0) {
      const clData = [
        ["ID", "সদস্যের নাম", "অপসারণের তারিখ", "মোট পরিশোধ (৳)", "নোট"],
        ...appState.clearanceLogs.map(c => [
          c.id,
          c.memberName || "",
          (c.date || "").substring(0, 10),
          c.totalPaidOut || 0,
          c.note || ""
        ])
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(clData), "ক্লিয়ারেন্স লগ");
    }

    // ── Sheet 5: Config ──
    const cfg = appState.config || {};
    const cfgData = [
      ["সেটিং (Setting)", "মান (Value)"],
      ["ফান্ডের নাম", cfg.fundName || ""],
      ["মাসিক কিস্তি (৳)", cfg.monthlyInstallment || 0],
      ["বার্ষিক বুস্টার (৳)", cfg.annualBooster || 0],
      ["প্রতিদিন জরিমানা (%)", cfg.penaltyPerDay || 0],
      ["সর্বোচ্চ জরিমানা সীমা (%)", cfg.maxPenaltyLimit || 0],
      ["তহবিল শুরুর তারিখ", cfg.fundStartDate || ""],
      ["কিস্তি জমার দিন (মাসের)", cfg.dueDayOfMonth || ""]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cfgData), "কনফিগ (Config)");

    // Write and download single .xlsx file
    XLSX.writeFile(wb, `somobay-export-${today}.xlsx`);
    showToast("Excel ফাইল এক্সপোর্ট হয়েছে (.xlsx)");
  } catch (err) {
    console.error("CSV/Excel Export failed", err);
    showToast("এক্সপোর্ট করতে সমস্যা হয়েছে", true);
  }
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      
      // Validation: checking if it has core members array
      if (!data || !Array.isArray(data.members)) {
        return showToast("অবৈধ ডাটা ফাইল। সঠিক ব্যাকআপ ফাইল সিলেক্ট করুন।", true);
      }

      openConfirm(
        "ব্যাকআপ ইম্পোর্ট করবেন?", 
        "আপনার বর্তমান সকল হিসাব মুছে ফাইল থেকে নতুন হিসাব সেট করা হবে। আপনি কি নিশ্চিত?", 
        () => {
          // 📊 Migration/Repair Strategy:
          // Ensure all required fields exist even if the backup is from an older version
          const migratedState = {
            config: { ...defaultConfig, ...(data.config || {}) },
            members: data.members || [],
            transactions: data.transactions || [],
            depositHistory: data.depositHistory || [],
            clearanceLogs: data.clearanceLogs || []
          };

          appState = migratedState;
          saveData();
          refreshUI();
          loadSettings();
          showToast("সফলভাবে সকল ডেটা ইম্পোর্ট করা হয়েছে");
        }
      );
    } catch (err) {
      console.error("Import error", err);
      showToast("ফাইল পড়তে সমস্যা হয়েছে বা ফাইলটি সঠিক নয়", true);
    }
  };
  reader.readAsText(file);
  e.target.value = ""; // Clear for next use
}
function confirmReset() {
    openConfirm(
        "সকল ডেটা মুছবেন?",
        "সদস্যদের নাম ও সেটিংস বাদে সকল লেনদেন ও জমার রেকর্ড মুছে যাবে। ডেটা মুছে যাওয়ার আগে অটোমেটিক একটি ব্যাকআপ ফাইল ডাউনলোড হবে।",
        () => {
            // ১. অটোমেটিক ব্যাকআপ ডাউনলোড করা
            try {
                const blob = new Blob([JSON.stringify(appState, null, 2)], { type: "application/json" });
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `somobay-auto-backup-${new Date().toISOString().split("T")[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(a.href);
            } catch (e) {
                console.error("Backup failed", e);
            }
    
            // ২. আর্থিক লেনদেন, জমার ইতিহাস এবং ঋণ মুছে ফেলা
            appState.transactions = [];
            appState.depositHistory = [];
            
            // ৩. অপসারিত সদস্যের লভ্যাংশ ও পেমেন্ট লগ (Logs) মুছে ফেলা
            appState.clearanceLogs = [];
            
            // ৪. অপসারিত (Removed) সদস্যদের তথ্য এবং অন্যান্য লগ মুছে ফেলা
            // আমরা শুধু সক্রিয় সদস্যদের প্রোফাইল রাখবো
            appState.members = (appState.members || []).filter(m => !m.archived);
            
            // ৫. সদস্যদের প্রোফাইল ডিটেইলস ঠিক রেখে তাদের জমার পরিমাণ ০ করে দেওয়া 
            // (যেহেতু জমার ইতিহাস বা ট্রানজ্যাকশন এখন নেই)
            appState.members.forEach(member => {
                member.deposited = 0;
            });
            
            // ৬. নতুন ডেটা সেভ করা এবং UI রিফ্রেশ করা
            saveData();
            refreshUI();
            loadSettings();
            
            showToast("লেনদেন ও অপসারিত ডেটা রিসেট সম্পন্ন ও ব্যাকআপ সেভ হয়েছে");
        }
    );
}

function showToast(msg, err=false) {
  const t = document.getElementById("toast"), i = t.querySelector("i");
  document.getElementById("toast-message").textContent = msg;
  i.className = err ? "fas fa-exclamation-circle" : "fas fa-check-circle"; i.style.color = err ? "var(--danger)" : "var(--primary-light)";
  t.classList.add("show"); setTimeout(() => t.classList.remove("show"), 2500);
}

// =========================================
// INTERACTIVE MONTHLY SUMMARY TABLE LOGIC
// =========================================

function changeSummaryYear(year) {
  summaryTableYear = parseInt(year);
  renderDepositSummaryTable();
}

function renderDepositSummaryTable() {
  const container = document.getElementById("deposit-summary-table");
  const yearSelect = document.getElementById("summary-year-select");
  if (!container || !yearSelect) return;

  // বছর সিলেক্টরের অপশন তৈরি করা (যদি না থাকে)
  if (yearSelect.options.length === 0) {
    const startYear = 2024;
    const currentYear = new Date().getFullYear() + 1;
    for (let y = currentYear; y >= startYear; y--) {
      yearSelect.innerHTML += `<option value="${y}" ${y === summaryTableYear ? 'selected' : ''}>${toBengaliNum(y)}</option>`;
    }
  }

  const monthlyInstallment = appState.config?.monthlyInstallment || 1000;
  const annualBooster = appState.config?.annualBooster || 5000;
  // সেটিংসে দেওয়া "সমিতি শুরুর তারিখ" অথবা ডিফল্ট একটি তারিখ
  const globalStartDateStr = appState.config?.fundStartDate || "2025-01-01";
  const globalStartDate = new Date(globalStartDateStr);
  const today = new Date();

  let html = `
    <thead>
      <tr>
        <th class="sticky-col">সদস্যের নাম</th>
        <th>মোট জমা</th>
        <th>বকেয়া</th>
        <th>অগ্রিম</th>
        ${bengaliMonths.map(m => `<th>${m}</th>`).join("")}
      </tr>
    </thead>
    <tbody>
  `;

  let grandTotalDeposit = 0, grandTotalDue = 0, grandTotalAdvance = 0;
  let colTotals = new Array(12).fill(0);

  appState.members.filter(m => !m.archived).forEach(member => {
    let joinDate = new Date(member.openingDate || "2025-01-01");
    
    // Effective Date: সমিতি শুরু অথবা সদস্য যোগদানের মধ্যে যেটি পরে আসবে
    let effectiveDate = joinDate > globalStartDate ? joinDate : globalStartDate;
    let effYear = effectiveDate.getFullYear();
    let effMonth = effectiveDate.getMonth();
    let curYear = today.getFullYear();
    let curMonth = today.getMonth();

    // ওই নির্দিষ্ট বছরের (summaryTableYear) জন্য কত মাস অতিবাহিত হয়েছে তার হিসাব
    let monthsPassedInYear = 0;
    if (summaryTableYear < effYear || summaryTableYear > curYear) {
        monthsPassedInYear = 0;
    } else if (summaryTableYear === effYear && summaryTableYear === curYear) {
        monthsPassedInYear = curMonth - effMonth + 1;
    } else if (summaryTableYear === effYear && summaryTableYear < curYear) {
        monthsPassedInYear = 12 - effMonth;
    } else if (summaryTableYear > effYear && summaryTableYear === curYear) {
        monthsPassedInYear = curMonth + 1;
    } else {
        monthsPassedInYear = 12; 
    }
    
    if (monthsPassedInYear < 0) monthsPassedInYear = 0;

    // Audit #Target: এই মেম্বারের সিলেক্ট করা বছরের সব জমা (Target মাসের ভিত্তিতে)
    const memberDeposits = (appState.depositHistory || []).filter(d => {
      const target = getDepositTarget(d);
      return d.memberId === member.id && target.year === summaryTableYear;
    });

    let monthlySums = new Array(12).fill(0);
    memberDeposits.forEach(d => {
      const target = getDepositTarget(d);
      monthlySums[target.month] += d.amount;
    });

    let yearlyTotal = monthlySums.reduce((a, b) => a + b, 0);
    
    // Running Year এর জন্য Booster/Advance এবং Due এর হিসাব
    let expectedRegular = monthsPassedInYear * monthlyInstallment;
    // যদি ওই বছরে অন্তত ১ মাসও পার হয়ে থাকে, তাহলে পুরো বছরের বুস্টার ডিউ হিসেবে ধরা হবে
    let boosterForYear = monthsPassedInYear > 0 ? annualBooster : 0; 
    let expectedTotal = expectedRegular + boosterForYear;
    
    let due = Math.max(0, expectedTotal - yearlyTotal);
    
    let totalRegularPaid = 0;
    monthlySums.forEach(amount => {
      totalRegularPaid += Math.min(amount, monthlyInstallment);
    });
    let advance = yearlyTotal - totalRegularPaid; 

    grandTotalDeposit += yearlyTotal;
    grandTotalDue += due;
    grandTotalAdvance += advance;

    html += `<tr>`;
    html += `<td class="sticky-col">${member.name}</td>`;
    html += `<td class="val-paid">${fmtCurrency(yearlyTotal)}</td>`;
    html += `<td class="${due > 0 ? 'val-due' : ''}">${due > 0 ? '-' + fmtCurrency(due) : '৳০'}</td>`;
    html += `<td class="val-adv">${advance > 0 ? fmtCurrency(advance) : '৳০'}</td>`;

    // ১২ মাসের কলাম রেন্ডার করা
    for (let i = 0; i < 12; i++) {
        let val = monthlySums[i];
        colTotals[i] += val;
        
        // ডিউ না থাকা মাসগুলোকে (যেমন ভবিষ্যতের মাস বা সমিতি শুরুর আগের মাস) একটু ম্লান করে দেওয়া
        let isInactiveMonth = false;
        if (summaryTableYear === effYear && i < effMonth) isInactiveMonth = true;
        if (summaryTableYear === curYear && i > curMonth) isInactiveMonth = true;
        if (summaryTableYear < effYear || summaryTableYear > curYear) isInactiveMonth = true;

        if (val > 0) {
            html += `<td style="color:var(--primary-dark); font-weight:600; cursor:pointer; background:#f0fdf4;" onclick="openQuickDeposit(${member.id}, ${i}, ${val})" title="এডিট করতে ট্যাপ করুন">${fmtCurrency(val)}</td>`;
        } else {
            if(isInactiveMonth) {
               html += `<td class="cell-blank" style="background:#f3f4f6; opacity:0.6;" onclick="openQuickDeposit(${member.id}, ${i}, 0)" title="ট্যাপ করে জমা দিন"></td>`;
            } else {
               html += `<td class="cell-blank" onclick="openQuickDeposit(${member.id}, ${i}, 0)" title="ট্যাপ করে জমা দিন"></td>`;
            }
        }
    }
    html += `</tr>`;
  });

  html += `<tr class="table-footer">
    <td class="sticky-col">TOTAL</td>
    <td class="val-paid">${fmtCurrency(grandTotalDeposit)}</td>
    <td class="${grandTotalDue > 0 ? 'val-due' : ''}">${grandTotalDue > 0 ? '-' + fmtCurrency(grandTotalDue) : '৳০'}</td>
    <td class="val-adv">${fmtCurrency(grandTotalAdvance)}</td>
    ${colTotals.map(t => `<td>${t > 0 ? fmtCurrency(t) : '-'}</td>`).join("")}
  </tr></tbody>`;

  container.innerHTML = html;
}

function openQuickDeposit(memberId, monthIndex, existingAmount = 0) {
    const member = appState.members.find(m => m.id === memberId);
    if (!member) return;
    
    quickDepositContext = { memberId, monthIndex, year: summaryTableYear };
    document.getElementById("qd-member-name").textContent = member.name;
    document.getElementById("qd-month-name").textContent = `${bengaliMonths[monthIndex]} ${toBengaliNum(summaryTableYear)}`;
    
    const amountInput = document.getElementById("qd-amount");
    const dateInput = document.getElementById("qd-date");
    const clearBtn = document.getElementById("qd-clear-btn");
    
    // Default actual date to today
    dateInput.value = new Date().toLocaleDateString('en-CA');

    // যদি আগে থেকে জমা থাকে, তাহলে এডিটের জন্য ভ্যালু দেখাবে এবং Clear বাটন আসবে
    if (existingAmount > 0) {
        amountInput.value = existingAmount;
        clearBtn.style.display = "flex";
        
        // এডিট মোডে থাকলে ওই জমার প্রকৃত তারিখটিও দেখানো উচিত (যদি থাকে)
        const rec = (appState.depositHistory || []).find(d => 
            d.memberId === memberId && d.targetYear === summaryTableYear && d.targetMonth === monthIndex
        );
        if (rec && rec.date) {
            // Convert ISO date string to yyyy-MM-dd for <input type="date">
            dateInput.value = rec.date.substring(0, 10);
        }
    } else {
        amountInput.value = appState.config?.monthlyInstallment || 1000;
        clearBtn.style.display = "none";
    }
    
    // Update Bengali date display and dynamic comment
    const dateBn = document.getElementById("qd-date-bn");
    if (dateBn) dateBn.textContent = formatBengaliDate(dateInput.value);
    
    // Initialize dynamic comment
    updateQdDynamicComment();
    
    document.getElementById("quick-deposit-modal").classList.add("active");
}

// Dynamic comment updater for quick deposit modal
function updateQdDynamicComment() {
    const commentEl = document.getElementById("qd-dynamic-comment");
    if (!commentEl) return;
    
    const memberName = document.getElementById("qd-member-name")?.textContent || "";
    const monthName = document.getElementById("qd-month-name")?.textContent || "";
    const amount = document.getElementById("qd-amount")?.value || "";
    const amountBn = amount ? toBengaliNum(amount) : "";
    const dateVal = document.getElementById("qd-date")?.value;
    const dateBn = formatBengaliDate(dateVal);
    
    if (memberName && amount) {
commentEl.innerHTML = `<i class="fas fa-coins"></i> ${memberName} ${monthName} এর জন্য ${amountBn} টাকা জমা দিচ্ছেন।<br>জমার তারিখঃ ${dateBn}`;
    } else {
        commentEl.innerHTML = `<i class="fas fa-edit"></i> পরিমাণ প্রদান করুন`;
    }
}

// Initialize quick deposit dynamic comment
function initQdDynamicComment() {
    const amountEl = document.getElementById("qd-amount");
    const dateEl = document.getElementById("qd-date");
    if (amountEl) {
        amountEl.addEventListener("input", updateQdDynamicComment);
        amountEl.addEventListener("change", updateQdDynamicComment);
    }
    if (dateEl) {
        dateEl.addEventListener("input", updateQdDynamicComment);
        dateEl.addEventListener("change", updateQdDynamicComment);
    }
}

// Dynamic comment updater for new member form
function updateNewMemberDynamicComment() {
    const commentEl = document.getElementById("new-member-dynamic-comment");
    if (!commentEl) return;
    
    const name = document.getElementById("new-member-name")?.value || "";
    const phone = document.getElementById("new-member-phone")?.value || "";
    const dateVal = document.getElementById("new-member-date")?.value;
    const dateBn = formatBengaliDate(dateVal);
    const deposit = document.getElementById("new-member-deposit")?.value || "";
    const depositBn = deposit ? toBengaliNum(deposit) : "";
    
    if (name && deposit) {
        commentEl.innerHTML = `<i class="fas fa-user-plus"></i> নতুন সদস্য ${name} যোগদান করছেন। ফোন: ${phone}। যোগদান তারিখ: ${dateBn}। প্রারম্ভিক জমা: ${depositBn} টাকা`;
    } else if (name) {
        commentEl.innerHTML = `<i class="fas fa-edit"></i> ${name} এর তথ্য প্রদান করুন`;
    } else {
        commentEl.innerHTML = `<i class="fas fa-edit"></i> সদস্যের নাম এবং তথ্য প্রদান করুন`;
    }
}

// Initialize new member dynamic comment
function initNewMemberDynamicComment() {
    const fields = ["new-member-name", "new-member-phone", "new-member-date", "new-member-deposit"];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", updateNewMemberDynamicComment);
            el.addEventListener("change", updateNewMemberDynamicComment);
        }
    });
}

// Dynamic comment updater for edit member form
function updateEditMemberDynamicComment() {
    const commentEl = document.getElementById("edit-member-dynamic-comment");
    if (!commentEl) return;
    
    const name = document.getElementById("edit-bn-name")?.value || "";
    const phone = document.getElementById("edit-phone")?.value || "";
    const dateVal = document.getElementById("edit-joining-date")?.value;
    const dateBn = formatBengaliDate(dateVal);
    
    if (name) {
        commentEl.innerHTML = `<i class="fas fa-user-edit"></i> ${name} এর তথ্য সম্পাদনা করছেন। ফোন: ${phone}। যোগদান তারিখ: ${dateBn}`;
    } else {
        commentEl.innerHTML = `<i class="fas fa-edit"></i> সদস্যের তথ্য সম্পাদনা করুন`;
    }
}

// Initialize edit member dynamic comment
function initEditMemberDynamicComment() {
    const fields = ["edit-bn-name", "edit-phone", "edit-email", "edit-joining-date"];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener("input", updateEditMemberDynamicComment);
            el.addEventListener("change", updateEditMemberDynamicComment);
        }
    });
}

function closeQuickDeposit() {
    document.getElementById("quick-deposit-modal").classList.remove("active");
    quickDepositContext = null;
}

// নতুন ফাংশন: নির্দিষ্ট মাসের জমা ডিলিট করা
function clearMonthDeposit() {
    if (!quickDepositContext) return;
    
    openConfirm("জমা মুছুন?", "আপনি কি এই মাসের সম্পূর্ণ জমা মুছে ফেলতে চান?", () => {
        // নতুন লজিক: targetYear/Month দিয়ে ফিল্টার করা
        const member = appState.members.find(m => m.id === quickDepositContext.memberId);
        if (member) {
            const toRemove = (appState.depositHistory || []).filter(d => 
                d.memberId === quickDepositContext.memberId && 
                d.targetYear === quickDepositContext.year && 
                d.targetMonth === quickDepositContext.monthIndex
            );
            let sumToRemove = toRemove.reduce((sum, d) => sum + d.amount, 0);
            member.deposited -= sumToRemove;
            if (member.deposited < 0) member.deposited = 0;
        }
        
        appState.depositHistory = (appState.depositHistory || []).filter(d => 
            !(d.memberId === quickDepositContext.memberId && 
              d.targetYear === quickDepositContext.year && 
              d.targetMonth === quickDepositContext.monthIndex)
        );
        
        saveData();
        refreshUI();
        closeQuickDeposit();
        showToast("জমা মুছে ফেলা হয়েছে");
    });
}

// জমা সেভ বা এডিট করার লজিক
document.getElementById("qd-form").addEventListener("submit", function(e) {
    e.preventDefault();
    if (!quickDepositContext) return;
    
    const newAmount = parseFloat(document.getElementById("qd-amount").value);
    const actualDate = document.getElementById("qd-date").value || new Date().toLocaleDateString('en-CA');
    if (!newAmount || newAmount <= 0) return showToast("সঠিক পরিমাণ লিখুন", true);
    
    const member = appState.members.find(m => m.id === quickDepositContext.memberId);
    if (member) {
        // Audit logic: clear existing for this target month
        const existingDeposits = (appState.depositHistory || []).filter(d => 
            d.memberId === quickDepositContext.memberId && 
            d.targetYear === quickDepositContext.year && 
            d.targetMonth === quickDepositContext.monthIndex
        );
        
        let oldSum = existingDeposits.reduce((sum, d) => sum + d.amount, 0);
        member.deposited -= oldSum;
        
        appState.depositHistory = (appState.depositHistory || []).filter(d => 
            !(d.memberId === quickDepositContext.memberId && 
              d.targetYear === quickDepositContext.year && 
              d.targetMonth === quickDepositContext.monthIndex)
        );
        
        member.deposited += newAmount;
        
        appState.depositHistory.push({
            id: Date.now(),
            memberId: member.id,
            memberName: member.name,
            desc: `${member.name} - ${bengaliMonths[quickDepositContext.monthIndex]} ${toBengaliNum(quickDepositContext.year)} এর জমা`,
            amount: newAmount,
            date: actualDate, // Actual physical date
            targetYear: quickDepositContext.year,
            targetMonth: quickDepositContext.monthIndex
        });
        
        saveData();
        refreshUI();
        closeQuickDeposit();
        showToast(`${member.name} এর জমা আপডেট হয়েছে`);
    }
});

// =========================================
// EDIT MEMBER FUNCTIONS
// =========================================
let editMemberOriginalDate = null;

function openEditMember(memberId) {
    const member = appState.members.find(m => m.id === memberId);
    if (!member) return;
    
    document.getElementById("edit-member-id").value = memberId;
    document.getElementById("edit-bn-name").value = member.name || "";
    document.getElementById("edit-en-name").value = member.englishName || "";
    document.getElementById("edit-phone").value = member.phone || "";
    document.getElementById("edit-email").value = member.email || "";
    document.getElementById("edit-joining-date").value = member.openingDate || "";
    
    editMemberOriginalDate = member.openingDate || "";
    document.getElementById("joining-date-warning").style.display = "none";
    document.getElementById("clear-past-dues").checked = false;
    
    // Update Bengali date display and dynamic comment
    const dateBn = document.getElementById("edit-joining-date-bn");
    if (dateBn) dateBn.textContent = formatBengaliDate(member.openingDate);
    updateEditMemberDynamicComment();
    
    document.getElementById("edit-member-modal").classList.add("active");
}

function closeEditMember() {
    document.getElementById("edit-member-modal").classList.remove("active");
    document.getElementById("edit-member-form").reset();
    editMemberOriginalDate = null;
}

// Joining date change detection
document.getElementById("edit-joining-date").addEventListener("change", function() {
    const newDate = this.value;
    const warning = document.getElementById("joining-date-warning");
    
    if (newDate && editMemberOriginalDate && newDate !== editMemberOriginalDate) {
        warning.style.display = "block";
    } else {
        warning.style.display = "none";
        document.getElementById("clear-past-dues").checked = false;
    }
});

// Edit member form submission
document.getElementById("edit-member-form").addEventListener("submit", function(e) {
    e.preventDefault();
    
    const memberId = parseInt(document.getElementById("edit-member-id").value);
    const member = appState.members.find(m => m.id === memberId);
    if (!member) return;
    
    const newBnName = document.getElementById("edit-bn-name").value.trim();
    const newEnName = document.getElementById("edit-en-name").value.trim();
    const newPhone = document.getElementById("edit-phone").value.trim();
    const newEmail = document.getElementById("edit-email").value.trim();
    const newJoiningDate = document.getElementById("edit-joining-date").value;
    const clearDues = document.getElementById("clear-past-dues").checked;
    
    if (!newBnName) return showToast("বাংলা নাম লিখুন", true);
    
    const joiningDateChanged = newJoiningDate && editMemberOriginalDate && newJoiningDate !== editMemberOriginalDate;
    
    const doSave = () => {
        const oldName = member.name;
        member.name = newBnName;
        member.englishName = newEnName || "";
        member.phone = newPhone || "";
        member.email = newEmail || "";
        
        if (newJoiningDate) {
            member.openingDate = newJoiningDate;
        }
        
        // Update name references in deposit history
        if (oldName !== newBnName) {
            (appState.depositHistory || []).forEach(d => {
                if (d.memberId === memberId) {
                    d.memberName = newBnName;
                    if (d.desc && d.desc.includes(oldName)) {
                        d.desc = d.desc.replace(oldName, newBnName);
                    }
                }
            });
        }
        
        // Clear past dues if user opted in
        if (joiningDateChanged && clearDues) {
            const newJoinDate = new Date(newJoiningDate);
            const depositsToRemove = (appState.depositHistory || []).filter(d => {
                return d.memberId === memberId && new Date(d.date) < newJoinDate;
            });
            
            let removedSum = depositsToRemove.reduce((sum, d) => sum + d.amount, 0);
            member.deposited -= removedSum;
            if (member.deposited < 0) member.deposited = 0;
            
            appState.depositHistory = (appState.depositHistory || []).filter(d => {
                return !(d.memberId === memberId && new Date(d.date) < newJoinDate);
            });
        }
        
        saveData();
        refreshUI();
        closeEditMember();
        renderMemberDetail(memberId);
        showToast("সদস্যের তথ্য আপডেট হয়েছে");
    };
    
    if (joiningDateChanged) {
        // Audit #6: Prevent/Warn date change if history exists
        const hasHistory = (appState.depositHistory || []).some(d => d.memberId === memberId);
        
        if (hasHistory && !clearDues) {
            return openConfirm(
                "যোগদানের তারিখ পরিবর্তন?",
                "এই সদস্যের আগে থেকে জমার ইতিহাস আছে। তারিখ পরিবর্তন করলে পূর্বের বকেয়ার হিসাব এলোমেলো হয়ে যেতে পারে। আপনি কি নিশ্চিত?",
                doSave
            );
        } else if (clearDues) {
            openConfirm(
                "পুরানো বকেয়া মাফ?",
                "যোগদানের তারিখ পরিবর্তন ও পুরানো বকেয়া মাফ করলে নতুন তারিখের আগের জমার ইতিহাস মুছে যাবে। আপনি কি নিশ্চিত?",
                doSave
            );
        } else {
            doSave();
        }
    } else {
        doSave();
    }
});

// =========================================
// DUE SUMMARY FUNCTIONS
// =========================================

function openDueSummary(memberId) {
    const m = financialMetrics;
    const member = m.processedMembers.find(mbr => mbr.id === memberId);
    if (!member) return;
    
    const container = document.getElementById("due-summary-content");
    const globalStartDate = new Date(appState.config?.fundStartDate || "2025-01-01");
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const monthlyInstallment = appState.config?.monthlyInstallment || 1000;
    const annualBooster = appState.config?.annualBooster || 5000;
    
    let joinDate = new Date(member.openingDate || "2025-01-01");
    if (isNaN(joinDate)) joinDate = new Date("2025-01-01");
    let effectiveDate = joinDate > globalStartDate ? joinDate : globalStartDate;
    
    // Audit Logic: Map all deposits to their targeted slots
    const deposits = (appState.depositHistory || []).filter(d => d.memberId === memberId);
    const slots = {}; 
    deposits.forEach(d => {
        const target = getDepositTarget(d);
        const key = `${target.year}-${target.month}`;
        slots[key] = (slots[key] || 0) + d.amount;
    });

    let totalUnpaidMonths = 0;
    let totalUnpaidBooster = 0;
    let totalAmountDueParsed = 0;
    let yearSections = [];
    
    const startYear = effectiveDate.getFullYear();
    for (let year = startYear; year <= currentYear; year++) {
        let monthChips = [];
        let yearUnpaidList = [];
        let sMonth = (year === startYear) ? effectiveDate.getMonth() : 0;
        let eMonth = (year === currentYear) ? currentMonth : 11;
        
        let monthsFoundInYear = 0;

        for (let mo = 0; mo < 12; mo++) {
            const key = `${year}-${mo}`;
            const paid = slots[key] || 0;
            const isDueRange = !(mo < sMonth || (year === currentYear && mo > eMonth) || year < startYear);
            
            if (!isDueRange) {
                monthChips.push(`<div class="due-month-chip inactive">${bengaliMonths[mo].substring(0, 3)}</div>`);
            } else {
                monthsFoundInYear++;
                if (paid >= monthlyInstallment) {
                    monthChips.push(`<div class="due-month-chip paid"><i class="fas fa-check"></i> ${bengaliMonths[mo].substring(0, 3)}</div>`);
                } else {
                    const remaining = monthlyInstallment - paid;
                    totalAmountDueParsed += remaining;
                    totalUnpaidMonths++;
                    monthChips.push(`<div class="due-month-chip unpaid"><i class="fas fa-times"></i> ${bengaliMonths[mo].substring(0, 3)}</div>`);
                    yearUnpaidList.push(bengaliMonths[mo]);
                }
            }
        }
        
        let boosterInfo = "";
        let boosterFullyPaid = false;
        if (monthsFoundInYear > 0 && annualBooster > 0) {
            const boosterPaidTotal = deposits.filter(d => {
                const target = getDepositTarget(d);
                return target.year === year && (d.desc && d.desc.toLowerCase().includes("boost"));
            }).reduce((sum, d) => sum + d.amount, 0);

            if (boosterPaidTotal >= annualBooster) {
                boosterFullyPaid = true;
                boosterInfo = `
                <div class="due-booster-card">
                    <span class="db-year"><i class="fas fa-rocket" style="margin-right:4px;"></i> বুস্টার ${toBengaliNum(year)}</span>
                    <span class="db-status paid">\u2705 পরিশোধিত</span>
                </div>`;
            } else {
                const remB = annualBooster - boosterPaidTotal;
                totalAmountDueParsed += remB;
                totalUnpaidBooster++;
                boosterFullyPaid = false;
                boosterInfo = `
                <div class="due-booster-card">
                    <span class="db-year"><i class="fas fa-rocket" style="margin-right:4px;"></i> বুস্টার ${toBengaliNum(year)}</span>
                    <span class="db-status unpaid">\u274C বকেয়া (${fmtCurrency(remB)})</span>
                </div>`;
            }
        }

        if (monthsFoundInYear > 0) {
            yearSections.push(`
                <div class="due-section-title"><i class="fas fa-calendar-alt"></i> ${toBengaliNum(year)} সালের বিবরণ</div>
                <div class="due-month-grid">${monthChips.join("")}</div>
                ${boosterInfo}
                ${yearUnpaidList.length > 0 ? `
                <div style="font-size:0.75rem; color:var(--danger); margin-bottom:14px; padding:6px 10px; background:#fef2f2; border-radius:6px;">
                    <i class="fas fa-info-circle" style="margin-right:4px;"></i> 
                    বকেয়া মাস: <strong>${yearUnpaidList.join(', ')}</strong>
                </div>` : `
                <div style="font-size:0.75rem; color:var(--primary); margin-bottom:14px; padding:6px 10px; background:#ecfdf5; border-radius:6px;">
                    <i class="fas fa-check-circle" style="margin-right:4px;"></i> 
                    এই বছরের সকল কিস্তি জমা সম্পূর্ণ
                </div>`}
            `);
        }
    }
    
    let html = `
        <div class="due-summary-header">
            <div class="dsh-total">${fmtCurrency(totalAmountDueParsed)}</div>
            <div class="dsh-label">${member.name} — মোট বকেয়া</div>
        </div>
        ${yearSections.join("")}
        <div style="margin-top:10px; padding:14px; background:#f8faf9; border-radius:var(--radius-md); border:1px solid var(--border-light);">
            <div class="due-section-title" style="margin-top:0;"><i class="fas fa-calculator"></i> সংক্ষিপ্ত হিসাব</div>
            <div class="due-breakdown-row">
                <span class="dbr-label">বকেয়া মাসের সংখ্যা</span>
                <span class="dbr-value ${totalUnpaidMonths > 0 ? 'due' : 'ok'}">${toBengaliNum(totalUnpaidMonths)} মাস</span>
            </div>
            ${annualBooster > 0 ? `
            <div class="due-breakdown-row">
                <span class="dbr-label">বকেয়া বুস্টার</span>
                <span class="dbr-value ${totalUnpaidBooster > 0 ? 'due' : 'ok'}">${totalUnpaidBooster > 0 ? toBengaliNum(totalUnpaidBooster) + ' বছর' : '\u2705 সম্পূর্ণ'}</span>
            </div>` : ''}
            <div class="due-breakdown-row" style="border-top:2px solid var(--border); padding-top:10px; margin-top:6px;">
                <span class="dbr-label" style="font-weight:700; font-size:0.9rem;">সর্বমোট বকেয়া</span>
                <span class="dbr-value ${totalAmountDueParsed > 0 ? 'due' : 'ok'}" style="font-size:1.05rem;">${fmtCurrency(totalAmountDueParsed)}</span>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
    document.getElementById("due-summary-modal").classList.add("active");
}

function closeDueSummary() {
    document.getElementById("due-summary-modal").classList.remove("active");
}

function showRules() {
    document.getElementById("rules-modal").classList.add("active");
}

function closeRules() {
    document.getElementById("rules-modal").classList.remove("active");
}

function refreshUI() {
  calculateFinances(); updateHeader(); updateBalanceHero(); updateDashboardStats(); renderRecentTransactions();
  renderMembers(); renderTransactions(); renderLoans(); renderDue(); renderSummary(); renderClearanceLog();
  const activeMembersOnly = appState.members.filter(m => !m.archived);
  const sel = document.getElementById("tx-desc-select"); 
  if(sel) sel.innerHTML = activeMembersOnly.map(m => `<option value="${m.id}">${m.name}</option>`).join("");
  
  // 🟢 This calls the table to render!
  renderDepositSummaryTable();
}

// 🟢 App Initialization runs AT THE END of the script
loadData(); 
refreshUI();

const dIn = document.getElementById("tx-date"); if(dIn) dIn.value = new Date().toISOString().split("T")[0];
document.getElementById("tx-modal").addEventListener("click", e => { if (e.target.id === "tx-modal") closeModal(); });
document.getElementById("confirm-modal").addEventListener("click", e => { if (e.target.id === "confirm-modal") closeConfirm(); });
document.getElementById("quick-deposit-modal").addEventListener("click", e => { if (e.target.id === "quick-deposit-modal") closeQuickDeposit(); });
document.getElementById("loan-history-modal").addEventListener("click", e => { if (e.target.id === "loan-history-modal") closeLoanHistory(); });
document.getElementById("edit-member-modal").addEventListener("click", e => { if (e.target.id === "edit-member-modal") closeEditMember(); });
document.getElementById("due-summary-modal").addEventListener("click", e => { if (e.target.id === "due-summary-modal") closeDueSummary(); });
document.getElementById("rules-modal").addEventListener("click", e => { if (e.target.id === "rules-modal") closeRules(); });
document.getElementById("clearance-summary-modal").addEventListener("click", e => { if (e.target.id === "clearance-summary-modal") closeClearanceSummary(); });
document.getElementById("clearance-detail-modal").addEventListener("click", e => { if (e.target.id === "clearance-detail-modal") closeClearanceDetail(); });
document.querySelectorAll(".modal-overlay").forEach(m => { m.addEventListener("touchmove", e => { if(e.target === m) e.preventDefault(); }, {passive:false}); });

console.log("সমবায় ফান্ড প্রো ২.০ - Table Working ✅");
