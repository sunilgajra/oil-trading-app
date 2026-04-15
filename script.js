import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)

var DEF_P = ['Crude Oil','Diesel','Petrol','Kerosene','LPG'];

var state = {
  companies: [],
  currentCompanyId: null,
  products: [],
  productMeta: {},
  inventory: [],
  trades: [],
  orders: [],
  challans: [],
  suppliers: [],
  customers: []
};

var fmt = function(n){ return '₹' + Number(n || 0).toLocaleString('en-IN',{maximumFractionDigits:2}); };
var fmtN = function(n){ return Number(n || 0).toLocaleString('en-IN'); };
var fmtKG = function(n){ return Number(n || 0).toLocaleString('en-IN',{maximumFractionDigits:1}); };
var today = function(){ return new Date().toISOString().split('T')[0]; };
var toKG = function(v,d){
  if (v == null || d == null || d === '') return 0;
  return Number(v) * Number(d);
};
var escH = function(s){ return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); };

function getStoredCompanyId() {
  return localStorage.getItem('active_company_id');
}

function setStoredCompanyId(id) {
  localStorage.setItem('active_company_id', String(id));
}

function getCurrentCompany() {
  return state.companies.find(function(c){ return String(c.id) === String(state.currentCompanyId); }) || null;
}

function updateBranding() {
  var company = getCurrentCompany();
  var brandEl = document.getElementById('brandNameEl');
  var subEl = document.getElementById('brandSubEl');
  if (!brandEl || !subEl || !company) return;

  brandEl.textContent = company.name === 'Joy International' ? 'Joy International' : 'Murji Ravji & Co.';
  subEl.textContent = 'OIL TRADING & LOGISTICS';
  document.title = company.name + ' — Oil Trading & Inventory';
}

async function seedDefaultsIfEmpty() {
  const companiesRes = await supabase.from('companies').select('*');
  if (companiesRes.error) throw companiesRes.error;

  var companies = companiesRes.data || [];
  for (var i = 0; i < companies.length; i++) {
    const company = companies[i];
    const { data, error } = await supabase.from('products').select('id').eq('company_id', company.id).limit(1);
    if (error) throw error;
    if (!data || data.length === 0) {
      const ins = await supabase.from('products').insert(
        DEF_P.map(function(name){
          return { name:name, density:null, hsn:'', company_id: company.id };
        })
      );
      if (ins.error) throw ins.error;
    }
  }
}

async function loadState() {
  await seedDefaultsIfEmpty();

  const companiesRes = await supabase.from('companies').select('*').order('name');
  if (companiesRes.error) throw companiesRes.error;

  state.companies = companiesRes.data || [];
  if (!state.companies.length) throw new Error('No companies found');

  var savedCompanyId = getStoredCompanyId();
  var hasSaved = state.companies.some(function(c){ return String(c.id) === String(savedCompanyId); });
  state.currentCompanyId = hasSaved ? savedCompanyId : state.companies[0].id;
  setStoredCompanyId(state.currentCompanyId);

  const [
    productsRes,
    inventoryRes,
    tradesRes,
    ordersRes,
    challansRes,
    suppliersRes,
    customersRes
  ] = await Promise.all([
    supabase.from('products').select('*').eq('company_id', state.currentCompanyId).order('name'),
    supabase.from('inventory').select('*').eq('company_id', state.currentCompanyId).order('id'),
    supabase.from('trades').select('*').eq('company_id', state.currentCompanyId).order('date'),
    supabase.from('orders').select('*').eq('company_id', state.currentCompanyId).order('date'),
    supabase.from('challans').select('*').eq('company_id', state.currentCompanyId).order('date'),
    supabase.from('suppliers').select('*').eq('company_id', state.currentCompanyId).order('name'),
    supabase.from('customers').select('*').eq('company_id', state.currentCompanyId).order('name')
  ]);

  if (productsRes.error) throw productsRes.error;
  if (inventoryRes.error) throw inventoryRes.error;
  if (tradesRes.error) throw tradesRes.error;
  if (ordersRes.error) throw ordersRes.error;
  if (challansRes.error) throw challansRes.error;
  if (suppliersRes.error) throw suppliersRes.error;
  if (customersRes.error) throw customersRes.error;

  state.products = (productsRes.data || []).map(function(p){ return p.name; });
  state.productMeta = {};
  (productsRes.data || []).forEach(function(p){
    state.productMeta[p.name] = {
      hsn: p.hsn || '',
      density: p.density ? Number(p.density) : null
    };
  });

  state.inventory = inventoryRes.data || [];
  state.trades = tradesRes.data || [];
  state.orders = ordersRes.data || [];
  state.challans = (challansRes.data || []).map(function(c){
    c.driverPh = c.driver_ph;
    return c;
  });
  state.suppliers = suppliersRes.data || [];
  state.customers = customersRes.data || [];
}

async function fetchBrentPrice() {
  try {
    document.getElementById('tickerEl').innerHTML =
      '<div class="ticker-item"><div class="ticker-name">Brent Crude</div><div class="ticker-price">Loading...</div><div class="ticker-chg">Live</div></div>';

    const res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF'));
    const data = await res.json();
    const result = data && data.chart && data.chart.result && data.chart.result[0];
    const meta = result && result.meta;
    const price = meta && (meta.regularMarketPrice || meta.previousClose);

    if (!price) throw new Error('No live price');

    document.getElementById('tickerEl').innerHTML =
      '<div class="ticker-item">' +
      '<div class="ticker-name">Brent Crude</div>' +
      '<div class="ticker-price">$' + Number(price).toFixed(2) + '</div>' +
      '<div class="ticker-chg up">Live</div>' +
      '</div>';
  } catch (e) {
    document.getElementById('tickerEl').innerHTML =
      '<div class="ticker-item">' +
      '<div class="ticker-name">Brent Crude</div>' +
      '<div class="ticker-price">Unavailable</div>' +
      '<div class="ticker-chg down">API error</div>' +
      '</div>';
  }
}

function syncUnitLabels(px) {
  var unitEl = document.getElementById(px + '-unit');
  if (!unitEl) return;
  var unit = unitEl.value;
  var qtyLabel = document.getElementById(px + '-qty-unit');
  var priceLabel = document.getElementById(px + '-price-unit');

  if (qtyLabel) qtyLabel.textContent = unit === 'kg' ? 'Kilograms' : 'Litres';
  if (priceLabel) priceLabel.innerHTML = unit === 'kg' ? '&#8377; / KG' : '&#8377; / Litre';
}

function toggleCustomTerm(px) {
  var sel = document.getElementById(px + '-terms');
  var cust = document.getElementById(px + '-custom-term');
  if (!sel || !cust) return;
  if (sel.value === '__custom__') cust.classList.add('show');
  else cust.classList.remove('show');
}

function openDeliveryOrderApp() {
  window.open('https://sunilgajra.github.io/delivery-order-app/', '_blank');
}

function renderCompanySwitcher() {
  var el = document.getElementById('companySwitcher');
  if (!el) return;

  el.innerHTML = state.companies.map(function(c) {
    return '<option value="' + c.id + '">' + escH(c.name) + '</option>';
  }).join('');

  el.value = state.currentCompanyId;
}

async function refreshAllViews() {
  await loadState();
  renderCompanySwitcher();
  updateBranding();
  populateSelects();
  populateCustomerSelect();
  populateTradePartySelect();
  renderProductsList();
  syncUnitLabels('inv');
  syncUnitLabels('tr');
  syncUnitLabels('ord');
  syncUnitLabels('ch');
  renderDashboardKpis();
  renderInvLevels();
  renderRecentTrades();
  renderActiveOrders();
  renderInventoryTable();
  renderTradesTable();
  renderOrdersTable();
  renderChallansTable();
  renderSuppliersTable();
  renderCustomersTable();
  renderReports();
}

async function changeCompany(companyId) {
  state.currentCompanyId = companyId;
  setStoredCompanyId(companyId);
  await refreshAllViews();
}

function downloadCSV(filename, rows) {
  var csv = rows.map(function(row) {
    return row.map(function(cell) {
      var val = cell == null ? '' : String(cell);
      val = val.replace(/"/g, '""');
      if (val.search(/("|,|\n)/g) >= 0) val = '"' + val + '"';
      return val;
    }).join(',');
  }).join('\n');

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printHTML(title, html) {
  var zone = document.getElementById('printZone');
  zone.innerHTML =
    '<div class="print-header">' +
      '<h1>' + escH((getCurrentCompany() || {}).name || 'Company') + '</h1>' +
      '<p>OIL TRADING & LOGISTICS</p>' +
    '</div>' +
    '<div class="print-title">' + escH(title) + '</div>' +
    html +
    '<div class="print-note">Generated on ' + new Date().toLocaleString('en-IN') + '</div>';

  setTimeout(function(){ window.print(); }, 300);
}

function downloadChallanPDF(id) {
  var c = state.challans.find(function(x){ return x.id === id; });
  if (!c) return toast('Challan not found', true);

  var displayQty = c.entered_qty || c.entered_kg || c.vol || 0;
  var displayUnit = c.qty_unit || (c.entered_kg ? 'kg' : 'litre');

  var html = '' +
  '<table class="print-table">' +
      '<tr><th>Challan No.</th><td>' + escH(c.id) + '</td></tr>' +
      '<tr><th>Date</th><td>' + escH(c.date) + '</td></tr>' +
      '<tr><th>Product</th><td>' + escH(c.product) + '</td></tr>' +
      '<tr><th>Quantity</th><td>' + fmtN(displayQty) + ' ' + (displayUnit === 'kg' ? 'KG' : 'L') + '</td></tr>' +
      '<tr><th>Base Volume</th><td>' + fmtN(c.vol || 0) + ' L</td></tr>' +
      '<tr><th>Weight</th><td>' + (c.weight ? fmtKG(c.weight) + ' KG' : '-') + '</td></tr>' +
      '<tr><th>Density</th><td>' + (c.density || '-') + '</td></tr>' +
      '<tr><th>Transporter</th><td>' + escH(c.transporter || '-') + '</td></tr>' +
      '<tr><th>' + (c.type==='in'?'Received From':'Dispatched From') + '</th><td>' + escH(c.from || '-') + '</td></tr>' +
      '<tr><th>' + (c.type==='in'?'Stored At':'Delivered To') + '</th><td>' + escH(c.to || '-') + '</td></tr>' +
      '<tr><th>Vehicle No.</th><td>' + escH(c.vehicle || '-') + '</td></tr>' +
      '<tr><th>Driver Name</th><td>' + escH(c.driver || '-') + '</td></tr>' +
      '<tr><th>Driver Phone</th><td>' + escH(c.driverPh || '-') + '</td></tr>' +
  '</table>';

  printHTML(c.type === 'in' ? 'INWARD DELIVERY CHALLAN' : 'OUTWARD DELIVERY CHALLAN', html);
}

function exportInventoryExcel() {
  try {
    var rows = state.inventory.map(function(i) {
      var qty = i.entered_qty || i.entered_kg || i.vol || 0;
      var unit = i.qty_unit || (i.entered_kg ? 'kg' : 'litre');
      return [
        i.product,
        i.hsn || '-',
        i.grade || '-',
        i.density || '',
        i.tank || '-',
        qty,
        unit,
        i.vol || 0,
        i.cost || 0,
        Number(qty || 0) * Number(i.cost || 0),
        i.threshold || 0
      ];
    });

    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    html += '<head><meta charset="UTF-8"><style>td,th{padding:6px 10px;border:1px solid #999;font-size:12px;font-family:Calibri,sans-serif;}th{background:#d4e6b5;font-weight:bold;color:#1a5c2e;}.num{text-align:right;}</style></head><body><table>';
    html += '<tr><th>Product</th><th>HSN</th><th>Grade</th><th>Density</th><th>Tank</th><th>Qty</th><th>Unit</th><th>Base Volume (L)</th><th>Rate</th><th>Total Value</th><th>Threshold</th></tr>';
    for (var r = 0; r < rows.length; r++) {
      html += '<tr>';
      html += '<td>' + escH(rows[r][0]) + '</td>';
      html += '<td>' + escH(rows[r][1]) + '</td>';
      html += '<td>' + escH(rows[r][2]) + '</td>';
      html += '<td class="num">' + (rows[r][3] || '') + '</td>';
      html += '<td>' + escH(rows[r][4]) + '</td>';
      html += '<td class="num">' + fmtN(rows[r][5]) + '</td>';
      html += '<td>' + escH(rows[r][6]) + '</td>';
      html += '<td class="num">' + fmtN(rows[r][7]) + '</td>';
      html += '<td class="num">' + Number(rows[r][8]).toFixed(2) + '</td>';
      html += '<td class="num">' + fmt(rows[r][9]) + '</td>';
      html += '<td class="num">' + fmtN(rows[r][10]) + '</td>';
      html += '</tr>';
    }
    html += '</table></body></html>';

    var blob = new Blob([html], {type: 'application/vnd.ms-excel;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'inventory_' + today() + '.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Excel file downloaded');
  } catch (err) {
    toast('Export failed: ' + err.message, true);
  }
}

function exportInventoryCSV() {
  var rows = [['Product','HSN','Grade','Density','Tank','Qty','Unit','Base Volume (L)','Rate','Value']];
  state.inventory.forEach(function(i) {
    var qty = i.entered_qty || i.entered_kg || i.vol || 0;
    var unit = i.qty_unit || (i.entered_kg ? 'kg' : 'litre');
    rows.push([i.product, i.hsn || '', i.grade || '', i.density || '', i.tank || '', qty, unit, i.vol || 0, i.cost || 0, Number(qty || 0) * Number(i.cost || 0)]);
  });
  downloadCSV('inventory_' + today() + '.csv', rows);
}

function printInventoryPDF() {
  var html = '<table class="print-table"><tr><th>Product</th><th>HSN</th><th>Grade</th><th>Density</th><th>Tank</th><th>Qty</th><th>Base Volume</th><th>Rate</th><th>Value</th></tr>';
  state.inventory.forEach(function(i) {
    var qty = i.entered_qty || i.entered_kg || i.vol || 0;
    var unit = i.qty_unit || (i.entered_kg ? 'kg' : 'litre');
    html += '<tr><td>' + escH(i.product) + '</td><td>' + escH(i.hsn || '-') + '</td><td>' + escH(i.grade || '-') + '</td><td>' + escH(i.density || '-') + '</td><td>' + escH(i.tank || '-') + '</td><td>' + fmtN(qty) + ' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmtN(i.vol || 0) + ' L</td><td>' + fmt(i.cost || 0) + ' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(Number(qty || 0) * Number(i.cost || 0)) + '</td></tr>';
  });
  html += '</table>';
  printHTML('Current Stock Report', html);
}

function exportTradesCSV() {
  var rows = [['Date','Type','Product','Party','Qty','Unit','Rate','Total','Terms','Density']];
  state.trades.forEach(function(t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0;
    var unit = t.qty_unit || (t.entered_kg ? 'kg' : 'litre');
    rows.push([t.date || '', t.type || '', t.product || '', t.party || '', qty, unit, t.price || 0, Number(qty || 0) * Number(t.price || 0), t.terms || '', t.density || '']);
  });
  downloadCSV('trades_' + today() + '.csv', rows);
}

function printTradesPDF() {
  var html = '<table class="print-table"><tr><th>Date</th><th>Type</th><th>Product</th><th>Party</th><th>Qty</th><th>Rate</th><th>Total</th></tr>';
  state.trades.forEach(function(t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0;
    var unit = t.qty_unit || (t.entered_kg ? 'kg' : 'litre');
    html += '<tr><td>' + escH(t.date || '') + '</td><td>' + escH(t.type || '') + '</td><td>' + escH(t.product || '') + '</td><td>' + escH(t.party || '') + '</td><td>' + fmtN(qty) + ' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(t.price || 0) + ' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(Number(qty || 0) * Number(t.price || 0)) + '</td></tr>';
  });
  html += '</table>';
  printHTML('Trade History Report', html);
}

function exportOrdersCSV() {
  var rows = [['Order ID','Customer','Product','Qty','Unit','Rate','Value','Status','Order Date','Due Date','Priority']];
  state.orders.forEach(function(o) {
    var qty = o.entered_qty || o.entered_kg || o.qty || 0;
    var unit = o.qty_unit || (o.entered_kg ? 'kg' : 'litre');
    rows.push([o.id || '', o.customer || '', o.product || '', qty, unit, o.price || 0, Number(qty || 0) * Number(o.price || 0), o.status || '', o.date || '', o.due || '', o.priority || '']);
  });
  downloadCSV('orders_' + today() + '.csv', rows);
}

function printOrdersPDF() {
  var html = '<table class="print-table"><tr><th>Order ID</th><th>Customer</th><th>Product</th><th>Qty</th><th>Rate</th><th>Value</th><th>Status</th><th>Due</th></tr>';
  state.orders.forEach(function(o) {
    var qty = o.entered_qty || o.entered_kg || o.qty || 0;
    var unit = o.qty_unit || (o.entered_kg ? 'kg' : 'litre');
    html += '<tr><td>' + escH(o.id || '') + '</td><td>' + escH(o.customer || '') + '</td><td>' + escH(o.product || '') + '</td><td>' + fmtN(qty) + ' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(o.price || 0) + ' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(Number(qty || 0) * Number(o.price || 0)) + '</td><td>' + escH(o.status || '') + '</td><td>' + escH(o.due || '') + '</td></tr>';
  });
  html += '</table>';
  printHTML('All Orders Report', html);
}

function getReportSummary() {
  var sales = 0, buys = 0;
  state.trades.forEach(function(t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0;
    var total = Number(qty || 0) * Number(t.price || 0);
    if (t.type === 'Sell') sales += total;
    else buys += total;
  });

  var profit = sales - buys;
  var customerMap = {};
  state.trades.forEach(function(t) {
    if (t.type !== 'Sell') return;
    var qty = t.entered_qty || t.entered_kg || t.vol || 0;
    var total = Number(qty || 0) * Number(t.price || 0);
    customerMap[t.party] = (customerMap[t.party] || 0) + total;
  });

  var topCustomers = Object.keys(customerMap)
    .map(function(name){ return { name:name, value:customerMap[name] }; })
    .sort(function(a,b){ return b.value - a.value; });

  return { sales:sales, buys:buys, profit:profit, topCustomers:topCustomers };
}

function exportReportsCSV() {
  var summary = getReportSummary();
  var rows = [
    ['REPORT SUMMARY'],
    ['Sales', summary.sales],
    ['Purchases', summary.buys],
    ['Profit', summary.profit],
    [''],
    ['TOP CUSTOMERS'],
    ['Customer','Revenue']
  ];

  summary.topCustomers.forEach(function(c) {
    rows.push([c.name, c.value]);
  });

  rows.push(['']);
  rows.push(['TRADE DETAILS']);
  rows.push(['Date','Type','Product','Party','Qty','Unit','Rate','Total']);

  state.trades.forEach(function(t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0;
    var unit = t.qty_unit || (t.entered_kg ? 'kg' : 'litre');
    rows.push([t.date || '', t.type || '', t.product || '', t.party || '', qty, unit, t.price || 0, Number(qty || 0) * Number(t.price || 0)]);
  });

  downloadCSV('reports_' + today() + '.csv', rows);
}

function printReportsPDF() {
  var summary = getReportSummary();
  var html = '';
  html += '<table class="print-table">';
  html += '<tr><th>Total Sales</th><td>' + fmt(summary.sales) + '</td></tr>';
  html += '<tr><th>Total Purchases</th><td>' + fmt(summary.buys) + '</td></tr>';
  html += '<tr><th>Net Profit</th><td>' + fmt(summary.profit) + '</td></tr>';
  html += '</table>';

  html += '<table class="print-table">';
  html += '<tr><th>Top Customers</th><th>Revenue</th></tr>';
  summary.topCustomers.forEach(function(c) {
    html += '<tr><td>' + escH(c.name) + '</td><td>' + fmt(c.value) + '</td></tr>';
  });
  html += '</table>';

  html += '<table class="print-table">';
  html += '<tr><th>Date</th><th>Type</th><th>Product</th><th>Party</th><th>Qty</th><th>Rate</th><th>Total</th></tr>';
  state.trades.forEach(function(t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0;
    var unit = t.qty_unit || (t.entered_kg ? 'kg' : 'litre');
    html += '<tr><td>' + escH(t.date || '') + '</td><td>' + escH(t.type || '') + '</td><td>' + escH(t.product || '') + '</td><td>' + escH(t.party || '') + '</td><td>' + fmtN(qty) + ' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(t.price || 0) + ' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(Number(qty || 0) * Number(t.price || 0)) + '</td></tr>';
  });
  html += '</table>';

  printHTML('Detailed Reports', html);
}

function handlePhotoUpload(input, pid) {
  var f = input.files[0];
  if (!f) return;
  var r = new FileReader();
  r.onload = function(e) {
    input.dataset.base64 = e.target.result;
    document.getElementById(pid).innerHTML = '<img src="' + e.target.result + '" class="photo-thumb" onclick="showImage(this.src)" alt="Slip">';
  };
  r.readAsDataURL(f);
}

function showImage(src) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.add('show');
}

function updateClock() {
  document.getElementById('clockEl').textContent = new Date().toLocaleString('en-IN', {dateStyle:'medium', timeStyle:'short'});
}
updateClock();
setInterval(updateClock, 30000);

function kpiC(label, val, sub) {
  return '<div class="kpi"><div class="kpi-label">'+label+'</div><div class="kpi-value">'+val+'</div><div class="kpi-change">'+sub+'</div></div>';
}

function statusBadge(s) {
  var m = {'Pending':'badge-gold','Dispatched':'badge-blue','Delivered':'badge-green'};
  return '<span class="badge '+(m[s]||'badge-gray')+'">'+s+'</span>';
}

function renderDashboardKpis() {
  var ts = 0, totalKG = 0;
  for (var i = 0; i < state.inventory.length; i++) {
    var invQty = state.inventory[i].entered_qty || state.inventory[i].entered_kg || state.inventory[i].vol || 0;
    ts += Number(invQty) * Number(state.inventory[i].cost || 0);
    totalKG += Number(state.inventory[i].entered_kg || 0) || toKG(state.inventory[i].vol, state.inventory[i].density);
  }
  var totalMT = totalKG / 1000;

  var sl = 0;
  for (var j = 0; j < state.trades.length; j++) {
    var tradeQty = state.trades[j].entered_qty || state.trades[j].entered_kg || state.trades[j].vol || 0;
    if (state.trades[j].type === 'Sell') sl += Number(tradeQty) * Number(state.trades[j].price || 0);
  }

  document.getElementById('kpiGrid').innerHTML =
    kpiC('Inventory Value', fmt(ts), 'Total Stock') +
    kpiC('Volume', fmtKG(totalKG) + ' KG / ' + totalMT.toFixed(2) + ' MT', 'By weight') +
    kpiC('Sales', fmt(sl), 'Revenue');
}

function renderInvLevels() {
  document.getElementById('invLevels').innerHTML = state.inventory.map(function(i) {
    var kg = Number(i.entered_kg || 0) || toKG(i.vol, i.density);
    var threshold = Number(i.threshold || 0);
    var p = threshold > 0 ? Math.min(100, Math.round(kg / (threshold * 10) * 100)) : 0;
    var c = p > 50 ? 'green' : p > 25 ? '' : 'red';
    return '<div class="progress-wrap"><div class="progress-label"><span>'+i.product+'</span><span class="mono">'+(kg ? fmtKG(kg) + ' KG' : fmtN(i.vol || 0) + ' L')+'</span></div><div class="progress"><div class="progress-fill '+c+'" style="width:'+p+'%"></div></div></div>';
  }).join('');
}

function renderRecentTrades() {
  document.getElementById('recentTradesTbl').innerHTML = state.trades.slice(-5).reverse().map(function(t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0;
    var unit = t.qty_unit || (t.entered_kg ? 'kg' : 'litre');
    var kg = t.entered_kg || (t.density ? toKG(t.vol, t.density) : 0);

    return '<tr>' +
      '<td>' + t.product + '</td>' +
      '<td><span class="badge ' + (t.type === 'Buy' ? 'badge-blue' : 'badge-green') + '">' + t.type + '</span></td>' +
      '<td class="mono">' + fmtN(qty) + ' ' + (unit === 'kg' ? 'KG' : 'L') + '</td>' +
      '<td class="mono">' + (kg ? fmtKG(kg) : '-') + '</td>' +
      '<td class="mono">' + fmt(t.price) + ' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td>' +
      '<td class="mono">' + fmt(Number(qty) * Number(t.price || 0)) + '</td>' +
    '</tr>';
  }).join('');
}

function renderActiveOrders() {
  document.getElementById('activeOrdersTbl').innerHTML = state.orders
    .filter(function(o){ return o.status !== 'Delivered'; })
    .map(function(o) {
      var qty = o.entered_qty || o.entered_kg || o.qty || 0;
      var unit = o.qty_unit || (o.entered_kg ? 'kg' : 'litre');

      return '<tr><td class="mono">'+o.id+'</td><td>'+o.customer+'</td><td>'+o.product+'</td><td class="mono">'+fmtN(qty)+' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td class="mono">'+fmt(Number(qty) * Number(o.price || 0))+'</td><td>'+statusBadge(o.status)+'</td><td class="mono">'+(o.due || '')+'</td></tr>';
    }).join('');
}

function populateSelects() {
  ['inv-product','tr-product','ord-product','ch-product'].forEach(function(id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = state.products.map(function(p){ return '<option>'+p+'</option>'; }).join('');
  });
}

function populateCustomerSelect() {
  var el = document.getElementById('ord-customer');
  if (!el) return;
  el.innerHTML = state.customers.map(function(c){
    return '<option value="' + escH(c.name) + '">' + escH(c.name) + '</option>';
  }).join('');
}

function populateTradePartySelect() {
  var el = document.getElementById('tr-party');
  if (!el) return;
  var opts = [];
  state.suppliers.forEach(function(s){ opts.push({type:'supplier', name:s.name}); });
  state.customers.forEach(function(c){ opts.push({type:'customer', name:c.name}); });
  el.innerHTML = opts.map(function(x){
    return '<option value="' + escH(x.name) + '">' + escH(x.name) + ' (' + x.type + ')</option>';
  }).join('');
}

function renderProductsList() {
  document.getElementById('productsList').innerHTML = state.products.map(function(p) {
    var meta = state.productMeta[p] || {};
    return '<div class="product-tag"><span>' + p + ' | HSN: ' + (meta.hsn || '-') + ' | Density: ' + (meta.density || '-') + '</span><span class="remove-prod" onclick="deleteProduct(\''+p.replace(/'/g,"\\'")+'\')">✕</span></div>';
  }).join('');
}

function renderInventoryTable() {
  var q = document.getElementById('invSearch').value.toLowerCase();
  document.getElementById('invTable').innerHTML = state.inventory.filter(function(i){
    return String(i.product || '').toLowerCase().indexOf(q) >= 0;
  }).map(function(i) {
    var qty = i.entered_qty || i.entered_kg || i.vol || 0;
    var unit = i.qty_unit || (i.entered_kg ? 'kg' : 'litre');
    return '<tr><td><b>'+i.product+'</b></td><td>'+(i.hsn || '-')+'</td><td>'+i.grade+'</td><td class="mono">'+(i.density || '-')+'</td><td>'+i.tank+'</td><td class="mono">'+fmtN(qty)+' '+(unit === 'kg' ? 'KG' : 'L')+'</td><td class="mono">'+fmtN(i.vol || 0)+' L</td><td class="mono">'+fmt(i.cost) + ' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td class="mono">'+fmt(Number(qty||0)*Number(i.cost||0))+'</td><td>-</td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'inventory\','+i.id+')">✕</button></td></tr>';
  }).join('');
}

async function addInventory() {
  var product = document.getElementById('inv-product').value;
  var qty = parseFloat(document.getElementById('inv-qty').value);
  var unit = document.getElementById('inv-unit').value;
  var price = parseFloat(document.getElementById('inv-price').value);
  var densityInput = document.getElementById('inv-density').value.trim();
  var density = densityInput ? parseFloat(densityInput) : null;

  if (!qty || !price) return toast('Please enter quantity and rate', true);

  var vol = unit === 'litre' ? qty : (density ? qty / density : 0);
  var enteredKg = unit === 'kg' ? qty : (density ? qty * density : null);
  var meta = state.productMeta[product] || {};

  var row = {
    company_id: state.currentCompanyId,
    product: product,
    hsn: document.getElementById('inv-hsn').value.trim() || meta.hsn || '-',
    grade: document.getElementById('inv-grade').value || '-',
    tank: document.getElementById('inv-tank').value || '-',
    qty_unit: unit,
    entered_qty: qty,
    vol: vol,
    entered_kg: enteredKg,
    cost: price,
    threshold: parseFloat(document.getElementById('inv-thresh').value) || 1000,
    density: density,
    slip: document.getElementById('inv-slip').dataset.base64 || null
  };

  const { data, error } = await supabase.from('inventory').insert([row]).select().single();
  if (error) return toast(error.message, true);

  state.inventory.push(data);
  renderInventoryTable();
  renderDashboardKpis();
  renderInvLevels();
  clearInvForm();
  toast('Stock added successfully ✅');
}

function clearInvForm() {
  ['inv-hsn','inv-grade','inv-qty','inv-price','inv-tank','inv-thresh','inv-density'].forEach(function(id){
    document.getElementById(id).value='';
  });
  document.getElementById('inv-unit').value = 'litre';
  syncUnitLabels('inv');
  document.getElementById('inv-slip-preview').innerHTML = '<div class="photo-placeholder">📷</div>';
}

function renderTradesTable() {
  document.getElementById('tradesTable').innerHTML = state.trades.slice().reverse().map(function(t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0;
    var unit = t.qty_unit || (t.entered_kg ? 'kg' : 'litre');
    return '<tr><td class="mono">' + t.date + '</td><td><span class="badge ' + (t.type === 'Buy' ? 'badge-blue' : 'badge-green') + '">' + t.type + '</span></td><td>' + t.product + '</td><td>' + t.party + '</td><td class="mono">' + fmtN(qty) + ' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td class="mono">' + fmt(t.price) + ' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td class="mono">' + fmt(Number(qty) * Number(t.price || 0)) + '</td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'trades\',' + t.id + ')">✕</button></td></tr>';
  }).join('');
}

async function addTrade() {
  var type = document.getElementById('tr-type').value;
  var product = document.getElementById('tr-product').value;
  var party = document.getElementById('tr-party').value;
  var qty = parseFloat(document.getElementById('tr-qty').value);
  var unit = document.getElementById('tr-unit').value;
  var price = parseFloat(document.getElementById('tr-price').value);
  var densityInput = document.getElementById('tr-density').value.trim();
  var density = densityInput ? parseFloat(densityInput) : null;

  if (!party || !qty || !price) return toast('Please fill required fields', true);

  var vol = unit === 'litre' ? qty : (density ? qty / density : 0);
  var enteredKg = unit === 'kg' ? qty : (density ? qty * density : null);
  var termsVal = document.getElementById('tr-terms').value;
  if (termsVal === '__custom__') termsVal = document.getElementById('tr-custom-term-val').value || 'Custom';

  var row = {
    company_id: state.currentCompanyId,
    type: type,
    product: product,
    party: party,
    qty_unit: unit,
    entered_qty: qty,
    vol: vol,
    entered_kg: enteredKg,
    price: price,
    date: document.getElementById('tr-date').value || today(),
    terms: termsVal,
    density: density
  };

  const { data, error } = await supabase.from('trades').insert([row]).select().single();
  if (error) return toast(error.message, true);

  state.trades.push(data);
  renderTradesTable();
  renderRecentTrades();
  renderDashboardKpis();
  renderReports();
  toast('Trade recorded');
}

function renderOrdersTable() {
  document.getElementById('ordersTable').innerHTML = state.orders.slice().reverse().map(function(o) {
    var qty = o.entered_qty || o.entered_kg || o.qty || 0;
    var unit = o.qty_unit || (o.entered_kg ? 'kg' : 'litre');
    return '<tr><td class="mono">'+o.id+'</td><td><b>'+o.customer+'</b></td><td>'+o.product+'</td><td class="mono">'+fmtN(qty)+' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td class="mono">'+fmt(o.price)+' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td class="mono">'+fmt(Number(qty) * Number(o.price || 0))+'</td><td>'+statusBadge(o.status)+'</td><td class="mono">'+(o.due||'')+'</td><td style="display:flex;gap:4px"><select onchange="updateOrderStatus(\''+o.id+'\',this.value)" style="font-size:10px;background:var(--bg);color:var(--text);border:1px solid var(--border)"><option '+(o.status==='Pending'?'selected':'')+'>Pending</option><option '+(o.status==='Dispatched'?'selected':'')+'>Dispatched</option><option '+(o.status==='Delivered'?'selected':'')+'>Delivered</option></select><button class="btn btn-danger btn-sm" onclick="deleteOrder(\''+o.id+'\')">✕</button></td></tr>';
  }).join('');
}

async function addOrder() {
  var customer = document.getElementById('ord-customer').value;
  var product = document.getElementById('ord-product').value;
  var qty = parseFloat(document.getElementById('ord-qty').value);
  var unit = document.getElementById('ord-unit').value;
  var price = parseFloat(document.getElementById('ord-price').value);
  var densityInput = document.getElementById('ord-density').value.trim();
  var density = densityInput ? parseFloat(densityInput) : null;

  if (!customer || !qty || !price) return toast('Please enter customer, quantity and rate', true);

  const { data: lastOrders, error: lastErr } = await supabase.from('orders').select('id').eq('company_id', state.currentCompanyId).order('created_at', { ascending:false }).limit(1);
  if (lastErr) return toast(lastErr.message, true);

  var nextNum = 1;
  if (lastOrders && lastOrders.length) {
    var m = String(lastOrders[0].id).match(/ORD-(\d+)/);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }

  var id = 'ORD-' + String(nextNum).padStart(3, '0');

  var row = {
    company_id: state.currentCompanyId,
    id: id,
    customer: customer,
    product: product,
    qty_unit: unit,
    entered_qty: qty,
    qty: unit === 'litre' ? qty : 0,
    entered_kg: unit === 'kg' ? qty : (density ? qty * density : null),
    price: price,
    date: document.getElementById('ord-date').value || today(),
    due: document.getElementById('ord-due').value || null,
    addr: '',
    priority: document.getElementById('ord-priority').value,
    status: 'Pending',
    density: density,
    terms: 'Immediate'
  };

  const { data, error } = await supabase.from('orders').insert([row]).select().single();
  if (error) return toast(error.message, true);

  state.orders.push(data);
  renderOrdersTable();
  renderActiveOrders();
  toast('Created ' + id);
}

async function updateOrderStatus(id, s) {
  const { error } = await supabase.from('orders').update({ status: s }).eq('id', id).eq('company_id', state.currentCompanyId);
  if (error) return toast(error.message, true);

  for (var i = 0; i < state.orders.length; i++) {
    if (state.orders[i].id === id) { state.orders[i].status = s; break; }
  }
  renderOrdersTable();
  renderActiveOrders();
  toast('Status updated');
}

function toggleChallanFields() {
  var t = document.getElementById('ch-type').value;
  document.getElementById('ch-from-group').querySelector('label').textContent = t==='in' ? 'Received From' : 'Dispatched From';
  document.getElementById('ch-to-group').querySelector('label').textContent = t==='in' ? 'Stored At' : 'Delivered To';
}

function renderChallansTable() {
  document.getElementById('challansTable').innerHTML = state.challans.slice().reverse().map(function(c) {
    var qty = c.entered_qty || c.entered_kg || c.vol || 0;
    var unit = c.qty_unit || (c.entered_kg ? 'kg' : 'litre');
    return '<tr><td class="mono"><b>'+c.id+'</b></td><td>'+(c.type==='in'?'<span class="badge badge-teal">In</span>':'<span class="badge badge-green">Out</span>')+'</td><td class="mono">'+c.date+'</td><td>'+c.product+'</td><td class="mono">'+fmtN(qty)+' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>'+(c.transporter||'-')+'</td><td>'+(c.from||'-')+'</td><td>'+(c.to||'-')+'</td><td class="mono">'+(c.vehicle||'-')+'</td><td style="display:flex;gap:4px"><button class="btn btn-primary btn-sm" onclick="downloadChallanPDF(\''+c.id+'\')">PDF</button><button class="btn btn-green btn-sm" onclick="shareWhatsApp(\''+c.id+'\')">WA</button><button class="btn btn-danger btn-sm" onclick="deleteChallan(\''+c.id+'\')">✕</button></td></tr>';
  }).join('');
}

async function addChallan() {
  var type = document.getElementById('ch-type').value;
  var no = document.getElementById('ch-no').value.trim();
  var product = document.getElementById('ch-product').value;
  var qty = parseFloat(document.getElementById('ch-qty').value);
  var unit = document.getElementById('ch-unit').value;
  var densityInput = document.getElementById('ch-density').value.trim();
  var density = densityInput ? parseFloat(densityInput) : null;

  if (!no) {
    const { data: lastRows, error: lastErr } = await supabase.from('challans').select('id').eq('company_id', state.currentCompanyId).order('created_at', { ascending:false }).limit(1);
    if (lastErr) return toast(lastErr.message, true);
    var nextNum = 1;
    if (lastRows && lastRows.length) {
      var m = String(lastRows[0].id).match(/CH-(\d+)/);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    no = 'CH-' + String(nextNum).padStart(3, '0');
  }

  if (!qty) return toast('Enter quantity', true);

  var vol = unit === 'litre' ? qty : (density ? qty / density : 0);
  var weight = unit === 'kg' ? qty : (density ? qty * density : null);

  var row = {
    company_id: state.currentCompanyId,
    id: no,
    type: type,
    date: document.getElementById('ch-date').value || today(),
    product: product,
    qty_unit: unit,
    entered_qty: qty,
    vol: vol,
    entered_kg: unit === 'kg' ? qty : weight,
    density: density,
    weight: weight,
    from: document.getElementById('ch-from').value,
    to: document.getElementById('ch-to').value,
    transporter: document.getElementById('ch-transporter').value,
    vehicle: document.getElementById('ch-vehicle').value,
    driver: document.getElementById('ch-driver').value,
    driver_ph: document.getElementById('ch-driver-ph').value
  };

  const { data, error } = await supabase.from('challans').insert([row]).select().single();
  if (error) return toast(error.message, true);

  data.driverPh = data.driver_ph;
  state.challans.push(data);
  renderChallansTable();
  toast('Created ' + no);
}

function renderSuppliersTable() {
  document.getElementById('suppliersTable').innerHTML = state.suppliers.map(function(s) {
    return '<tr><td><b>'+s.name+'</b></td><td>'+(s.gst||'')+'</td><td>'+(s.contact||'')+'</td><td class="mono">'+(s.phone||'')+'</td><td>'+(s.city||'')+'</td><td>'+(s.address||'')+'</td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'suppliers\','+s.id+')">✕</button></td></tr>';
  }).join('');
}

async function addSupplier() {
  var n = document.getElementById('sup-name').value;
  if (!n) return toast('Enter company name', true);

  var row = {
    company_id: state.currentCompanyId,
    name: n,
    gst: document.getElementById('sup-gst').value,
    contact: document.getElementById('sup-contact').value,
    phone: document.getElementById('sup-phone').value,
    city: document.getElementById('sup-city').value,
    address: document.getElementById('sup-address').value
  };

  const { data, error } = await supabase.from('suppliers').insert([row]).select().single();
  if (error) return toast(error.message, true);

  state.suppliers.push(data);
  renderSuppliersTable();
  populateTradePartySelect();
  toast('Supplier added');
}

function renderCustomersTable() {
  document.getElementById('customersTable').innerHTML = state.customers.map(function(c) {
    return '<tr><td><b>'+c.name+'</b></td><td>'+(c.gst||'')+'</td><td>'+(c.contact||'')+'</td><td class="mono">'+(c.phone||'')+'</td><td>'+(c.city||'')+'</td><td>'+(c.address||'')+'</td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'customers\','+c.id+')">✕</button></td></tr>';
  }).join('');
}

async function addCustomer() {
  var n = document.getElementById('cust-name').value;
  if (!n) return toast('Enter customer name', true);

  var row = {
    company_id: state.currentCompanyId,
    name: n,
    gst: document.getElementById('cust-gst').value,
    contact: document.getElementById('cust-contact').value,
    phone: document.getElementById('cust-phone').value,
    city: document.getElementById('cust-city').value,
    address: document.getElementById('cust-address').value
  };

  const { data, error } = await supabase.from('customers').insert([row]).select().single();
  if (error) return toast(error.message, true);

  state.customers.push(data);
  renderCustomersTable();
  populateCustomerSelect();
  populateTradePartySelect();
  toast('Customer added');
}

function renderReports() {
  var sales = 0, buys = 0;
  for (var i = 0; i < state.trades.length; i++) {
    var t = state.trades[i];
    var qty = t.entered_qty || t.entered_kg || t.vol || 0;
    if (t.type === 'Sell') sales += Number(qty) * Number(t.price || 0);
    else buys += Number(qty) * Number(t.price || 0);
  }
  var profit = sales - buys;
  document.getElementById('reportKpis').innerHTML =
    kpiC('Sales', fmt(sales), '') +
    kpiC('Purchases', fmt(buys), '') +
    kpiC('Profit', fmt(profit), '');

  document.getElementById('plSummary').innerHTML =
    '<div class="stat-row"><span>Total Revenue</span><span class="stat-val up">'+fmt(sales)+'</span></div>' +
    '<div class="stat-row"><span>Total Expenses</span><span class="stat-val down">'+fmt(buys)+'</span></div>' +
    '<div class="stat-row"><span>Net Profit</span><span class="stat-val '+(profit>=0?'up':'down')+'">'+fmt(profit)+'</span></div>';

  var cust = {};
  for (var j = 0; j < state.trades.length; j++) {
    var tr = state.trades[j];
    var qty2 = tr.entered_qty || tr.entered_kg || tr.vol || 0;
    if (tr.type === 'Sell') cust[tr.party] = (cust[tr.party]||0) + (Number(qty2) * Number(tr.price || 0));
  }
  var top = Object.keys(cust).map(function(k){ return [k, cust[k]]; }).sort(function(a,b){ return b[1]-a[1]; }).slice(0, 5);
  document.getElementById('topCustomers').innerHTML = top.map(function(c) {
    return '<div class="stat-row"><span>'+c[0]+'</span><span class="stat-val">'+fmt(c[1])+'</span></div>';
  }).join('') || '<div class="empty">No sales data yet</div>';
}

var _confirmResolve = null;
function customConfirm(msg) {
  document.getElementById('confirmMsg').textContent = msg;
  document.getElementById('confirmModal').classList.add('show');
  return new Promise(function(r){ _confirmResolve = r; });
}

document.getElementById('confirmYes').onclick = function() {
  document.getElementById('confirmModal').classList.remove('show');
  if (_confirmResolve) _confirmResolve(true);
};

document.getElementById('confirmNo').onclick = function() {
  document.getElementById('confirmModal').classList.remove('show');
  if (_confirmResolve) _confirmResolve(false);
};

async function deleteItem(arr, id) {
  const tableMap = { inventory:'inventory', trades:'trades', suppliers:'suppliers', customers:'customers' };
  customConfirm('Remove this item?').then(async function(ok) {
    if (!ok) return;
    const { error } = await supabase.from(tableMap[arr]).delete().eq('id', id).eq('company_id', state.currentCompanyId);
    if (error) return toast(error.message, true);

    state[arr] = state[arr].filter(function(x){ return x.id !== id; });

    if (arr === 'inventory') { renderInventoryTable(); renderDashboardKpis(); renderInvLevels(); }
    if (arr === 'trades') { renderTradesTable(); renderRecentTrades(); renderDashboardKpis(); renderReports(); }
    if (arr === 'suppliers') { renderSuppliersTable(); populateTradePartySelect(); }
    if (arr === 'customers') { renderCustomersTable(); populateCustomerSelect(); populateTradePartySelect(); }

    toast('Removed');
  });
}

async function deleteOrder(id) {
  customConfirm('Delete order ' + id + '?').then(async function(ok) {
    if (!ok) return;
    const { error } = await supabase.from('orders').delete().eq('id', id).eq('company_id', state.currentCompanyId);
    if (error) return toast(error.message, true);
    state.orders = state.orders.filter(function(o){ return o.id !== id; });
    renderOrdersTable();
    renderActiveOrders();
    toast('Order removed');
  });
}

async function deleteChallan(id) {
  customConfirm('Delete challan ' + id + '?').then(async function(ok) {
    if (!ok) return;
    const { error } = await supabase.from('challans').delete().eq('id', id).eq('company_id', state.currentCompanyId);
    if (error) return toast(error.message, true);
    state.challans = state.challans.filter(function(c){ return c.id !== id; });
    renderChallansTable();
    toast('Challan removed');
  });
}

async function deleteProduct(n) {
  customConfirm('Delete product "' + n + '"?').then(async function(ok) {
    if (!ok) return;
    const { error } = await supabase.from('products').delete().eq('name', n).eq('company_id', state.currentCompanyId);
    if (error) return toast(error.message, true);
    state.products = state.products.filter(function(p){ return p !== n; });
    delete state.productMeta[n];
    populateSelects();
    renderProductsList();
    toast('Product removed');
  });
}

async function addProductMaster() {
  var n = document.getElementById('pm-name').value.trim();
  if (!n) return toast('Enter product name', true);
  if (state.products.indexOf(n) >= 0) return toast('Product already exists', true);

  var densityVal = document.getElementById('pm-density').value.trim();

  var row = {
    company_id: state.currentCompanyId,
    name: n,
    hsn: document.getElementById('pm-hsn').value.trim() || '',
    density: densityVal ? parseFloat(densityVal) : null
  };

  const { data, error } = await supabase.from('products').insert([row]).select().single();
  if (error) return toast(error.message, true);

  state.products.push(data.name);
  state.productMeta[data.name] = {
    hsn: data.hsn || '',
    density: data.density ? Number(data.density) : null
  };

  populateSelects();
  renderProductsList();

  document.getElementById('pm-name').value = '';
  document.getElementById('pm-hsn').value = '';
  document.getElementById('pm-density').value = '';

  toast('Added: ' + n);
}

var _toastTimer = null;
function toast(msg, isErr) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 4000);
}

function switchPage(name) {
  document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
  document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
  if (window.event && window.event.target) window.event.target.classList.add('active');
  document.getElementById('page-' + name).classList.add('active');
  if (name === 'reports') renderReports();
}

window.switchPage = switchPage;
window.syncUnitLabels = syncUnitLabels;
window.toggleCustomTerm = toggleCustomTerm;
window.openDeliveryOrderApp = openDeliveryOrderApp;
window.changeCompany = changeCompany;
window.addProductMaster = addProductMaster;
window.deleteProduct = deleteProduct;
window.handlePhotoUpload = handlePhotoUpload;
window.showImage = showImage;
window.addInventory = addInventory;
window.clearInvForm = clearInvForm;
window.renderInventoryTable = renderInventoryTable;
window.addTrade = addTrade;
window.renderTradesTable = renderTradesTable;
window.addOrder = addOrder;
window.updateOrderStatus = updateOrderStatus;
window.toggleChallanFields = toggleChallanFields;
window.addChallan = addChallan;
window.downloadChallanPDF = downloadChallanPDF;
window.shareWhatsApp = shareWhatsApp;
window.addSupplier = addSupplier;
window.addCustomer = addCustomer;
window.deleteItem = deleteItem;
window.deleteOrder = deleteOrder;
window.deleteChallan = deleteChallan;
window.exportInventoryExcel = exportInventoryExcel;
window.printInventoryPDF = printInventoryPDF;
window.exportInventoryCSV = exportInventoryCSV;
window.printTradesPDF = printTradesPDF;
window.exportTradesCSV = exportTradesCSV;
window.printOrdersPDF = printOrdersPDF;
window.exportOrdersCSV = exportOrdersCSV;
window.printReportsPDF = printReportsPDF;
window.exportReportsCSV = exportReportsCSV;

async function init() {
  try {
    document.getElementById('tr-date').value = today();
    document.getElementById('ord-date').value = today();
    document.getElementById('ord-due').value = today();
    document.getElementById('ch-date').value = today();

    await refreshAllViews();
    toggleChallanFields();
    toggleCustomTerm('tr');

    fetchBrentPrice();
    setInterval(fetchBrentPrice, 300000);
  } catch (e) {
    console.error(e);
    toast('Failed to load data: ' + e.message, true);
  }
}
init();