import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)

var DEF_P = ['Crude Oil', 'Diesel', 'Petrol', 'Kerosene', 'LPG']

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
}

var fmt = function (n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 }) }
var fmtN = function (n) { return Number(n || 0).toLocaleString('en-IN') }
var fmtKG = function (n) { return Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 1 }) }
var today = function () { return new Date().toISOString().split('T')[0] }
var toKG = function (v, d) {
  if (v == null || d == null || d === '') return 0
  return Number(v) * Number(d)
}
var escH = function (s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getStoredCompanyId() {
  return localStorage.getItem('active_company_id')
}

function setStoredCompanyId(id) {
  localStorage.setItem('active_company_id', String(id))
}

function getCurrentCompany() {
  return state.companies.find(function (c) { return String(c.id) === String(state.currentCompanyId) }) || null
}

function updateBranding() {
  var company = getCurrentCompany()
  var brandEl = document.getElementById('brandNameEl')
  var subEl = document.getElementById('brandSubEl')
  if (!brandEl || !subEl || !company) return

  brandEl.textContent = company.name === 'Joy International' ? 'Joy International' : 'Murji Ravji & Co.'
  subEl.textContent = 'OIL TRADING & LOGISTICS'
  document.title = company.name + ' — Oil Trading & Inventory'
}

async function seedDefaultsIfEmpty() {
  const companiesRes = await supabase.from('companies').select('*')
  if (companiesRes.error) throw companiesRes.error

  var companies = companiesRes.data || []
  for (var i = 0; i < companies.length; i++) {
    const company = companies[i]
    const check = await supabase.from('products').select('id').eq('company_id', company.id).limit(1)
    if (check.error) throw check.error
    if (!check.data || check.data.length === 0) {
      const ins = await supabase.from('products').insert(
        DEF_P.map(function (name) {
          return { name: name, density: null, hsn: '', company_id: company.id }
        })
      )
      if (ins.error) throw ins.error
    }
  }
}

async function loadState() {
  await seedDefaultsIfEmpty()

  const companiesRes = await supabase.from('companies').select('*').order('name')
  if (companiesRes.error) throw companiesRes.error

  state.companies = companiesRes.data || []
  if (!state.companies.length) throw new Error('No companies found')

  var savedCompanyId = getStoredCompanyId()
  var hasSaved = state.companies.some(function (c) { return String(c.id) === String(savedCompanyId) })
  state.currentCompanyId = hasSaved ? savedCompanyId : state.companies[0].id
  setStoredCompanyId(state.currentCompanyId)

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
  ])

  if (productsRes.error) throw productsRes.error
  if (inventoryRes.error) throw inventoryRes.error
  if (tradesRes.error) throw tradesRes.error
  if (ordersRes.error) throw ordersRes.error
  if (challansRes.error) throw challansRes.error
  if (suppliersRes.error) throw suppliersRes.error
  if (customersRes.error) throw customersRes.error

  state.products = (productsRes.data || []).map(function (p) { return p.name })
  state.productMeta = {}
  ;(productsRes.data || []).forEach(function (p) {
    state.productMeta[p.name] = {
      hsn: p.hsn || '',
      density: p.density ? Number(p.density) : null
    }
  })

  state.inventory = inventoryRes.data || []
  state.trades = tradesRes.data || []
  state.orders = ordersRes.data || []
  state.challans = (challansRes.data || []).map(function (c) {
    c.driverPh = c.driver_ph
    return c
  })
  state.suppliers = suppliersRes.data || []
  state.customers = customersRes.data || []
}

async function fetchBrentPrice() {
  try {
    document.getElementById('tickerEl').innerHTML =
      '<div class="ticker-item"><div class="ticker-name">Brent Crude</div><div class="ticker-price">Loading...</div><div class="ticker-chg">Live</div></div>'

    const res = await fetch('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/BZ%3DF'))
    const data = await res.json()
    const result = data && data.chart && data.chart.result && data.chart.result[0]
    const meta = result && result.meta
    const price = meta && (meta.regularMarketPrice || meta.previousClose)

    if (!price) throw new Error('No live price')

    document.getElementById('tickerEl').innerHTML =
      '<div class="ticker-item">' +
      '<div class="ticker-name">Brent Crude</div>' +
      '<div class="ticker-price">$' + Number(price).toFixed(2) + '</div>' +
      '<div class="ticker-chg up">Live</div>' +
      '</div>'
  } catch (e) {
    document.getElementById('tickerEl').innerHTML =
      '<div class="ticker-item">' +
      '<div class="ticker-name">Brent Crude</div>' +
      '<div class="ticker-price">Unavailable</div>' +
      '<div class="ticker-chg down">API error</div>' +
      '</div>'
  }
}

function syncUnitLabels(px) {
  var unitEl = document.getElementById(px + '-unit')
  if (!unitEl) return
  var unit = unitEl.value
  var qtyLabel = document.getElementById(px + '-qty-unit')
  var priceLabel = document.getElementById(px + '-price-unit')

  if (qtyLabel) qtyLabel.textContent = unit === 'kg' ? 'Kilograms' : 'Litres'
  if (priceLabel) priceLabel.innerHTML = unit === 'kg' ? '&#8377; / KG' : '&#8377; / Litre'
}

function toggleCustomTerm(px) {
  var sel = document.getElementById(px + '-terms')
  var cust = document.getElementById(px + '-custom-term')
  if (!sel || !cust) return
  if (sel.value === '__custom__') cust.classList.add('show')
  else cust.classList.remove('show')
}

function openDeliveryOrderApp() {
  window.open('https://sunilgajra.github.io/delivery-order-app/', '_blank')
}

function renderCompanySwitcher() {
  var el = document.getElementById('companySwitcher')
  if (!el) return
  el.innerHTML = state.companies.map(function (c) {
    return '<option value="' + c.id + '">' + escH(c.name) + '</option>'
  }).join('')
  el.value = state.currentCompanyId
}

async function refreshAllViews() {
  await loadState()
  renderCompanySwitcher()
  updateBranding()
  populateSelects()
  populateCustomerSelect()
  populateTradePartySelect()
  renderProductsList()
  syncUnitLabels('inv')
  syncUnitLabels('tr')
  syncUnitLabels('ord')
  syncUnitLabels('ch')
  renderDashboardKpis()
  renderInvLevels()
  renderRecentTrades()
  renderActiveOrders()
  renderInventoryTable()
  renderTradesTable()
  renderOrdersTable()
  renderChallansTable()
  renderSuppliersTable()
  renderCustomersTable()
  renderReports()
}

async function changeCompany(companyId) {
  state.currentCompanyId = companyId
  setStoredCompanyId(companyId)
  await refreshAllViews()
}

function downloadCSV(filename, rows) {
  var csv = rows.map(function (row) {
    return row.map(function (cell) {
      var val = cell == null ? '' : String(cell)
      val = val.replace(/"/g, '""')
      if (val.search(/("|,|\n)/g) >= 0) val = '"' + val + '"'
      return val
    }).join(',')
  }).join('\n')

  var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  var url = URL.createObjectURL(blob)
  var a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function printHTML(title, html) {
  var zone = document.getElementById('printZone')
  zone.innerHTML =
    '<div class="print-header">' +
      '<h1>' + escH((getCurrentCompany() || {}).name || 'Company') + '</h1>' +
      '<p>OIL TRADING & LOGISTICS</p>' +
    '</div>' +
    '<div class="print-title">' + escH(title) + '</div>' +
    html +
    '<div class="print-note">Generated on ' + new Date().toLocaleString('en-IN') + '</div>'

  setTimeout(function () { window.print() }, 300)
}

function downloadChallanPDF(id) {
  var c = state.challans.find(function (x) { return x.id === id })
  if (!c) return toast('Challan not found', true)

  var displayQty = c.entered_qty || c.entered_kg || c.vol || 0
  var displayUnit = c.qty_unit || (c.entered_kg ? 'kg' : 'litre')

  var html =
    '<table class="print-table">' +
      '<tr><th>Challan No.</th><td>' + escH(c.id) + '</td></tr>' +
      '<tr><th>Date</th><td>' + escH(c.date) + '</td></tr>' +
      '<tr><th>Product</th><td>' + escH(c.product) + '</td></tr>' +
      '<tr><th>Quantity</th><td>' + fmtN(displayQty) + ' ' + (displayUnit === 'kg' ? 'KG' : 'L') + '</td></tr>' +
      '<tr><th>Base Volume</th><td>' + fmtN(c.vol || 0) + ' L</td></tr>' +
      '<tr><th>Weight</th><td>' + (c.weight ? fmtKG(c.weight) + ' KG' : '-') + '</td></tr>' +
      '<tr><th>Density</th><td>' + (c.density || '-') + '</td></tr>' +
      '<tr><th>Transporter</th><td>' + escH(c.transporter || '-') + '</td></tr>' +
      '<tr><th>' + (c.type === 'in' ? 'Received From' : 'Dispatched From') + '</th><td>' + escH(c.from || '-') + '</td></tr>' +
      '<tr><th>' + (c.type === 'in' ? 'Stored At' : 'Delivered To') + '</th><td>' + escH(c.to || '-') + '</td></tr>' +
      '<tr><th>Vehicle No.</th><td>' + escH(c.vehicle || '-') + '</td></tr>' +
      '<tr><th>Driver Name</th><td>' + escH(c.driver || '-') + '</td></tr>' +
      '<tr><th>Driver Phone</th><td>' + escH(c.driverPh || '-') + '</td></tr>' +
    '</table>'

  printHTML(c.type === 'in' ? 'INWARD DELIVERY CHALLAN' : 'OUTWARD DELIVERY CHALLAN', html)
}

function shareWhatsApp(id) {
  var c = state.challans.find(function (x) { return x.id === id })
  if (!c) return toast('Challan not found', true)

  var qty = c.entered_qty || c.entered_kg || c.vol || 0
  var unit = c.qty_unit || (c.entered_kg ? 'kg' : 'litre')

  var text =
    '*' + ((getCurrentCompany() || {}).name || 'Company') + '*\n' +
    'Challan: ' + c.id +
    '\nDate: ' + c.date +
    '\nProduct: ' + c.product +
    '\nQty: ' + fmtN(qty) + ' ' + (unit === 'kg' ? 'KG' : 'L') +
    '\nTransporter: ' + (c.transporter || '-') +
    '\nFrom: ' + (c.from || '-') +
    '\nTo: ' + (c.to || '-') +
    '\nVehicle: ' + (c.vehicle || '-')

  window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank')
}

function exportInventoryExcel() {
  try {
    var rows = state.inventory.map(function (i) {
      var qty = i.entered_qty || i.entered_kg || i.vol || 0
      var unit = i.qty_unit || (i.entered_kg ? 'kg' : 'litre')
      return [
        i.product, i.hsn || '-', i.grade || '-', i.density || '', i.tank || '-',
        qty, unit, i.vol || 0, i.cost || 0,
        Number(qty || 0) * Number(i.cost || 0), i.threshold || 0
      ]
    })

    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">'
    html += '<head><meta charset="UTF-8"><style>td,th{padding:6px 10px;border:1px solid #999;font-size:12px;font-family:Calibri,sans-serif;}th{background:#d4e6b5;font-weight:bold;color:#1a5c2e;}.num{text-align:right;}</style></head><body><table>'
    html += '<tr><th>Product</th><th>HSN</th><th>Grade</th><th>Density</th><th>Tank</th><th>Qty</th><th>Unit</th><th>Base Volume (L)</th><th>Rate</th><th>Total Value</th><th>Threshold</th></tr>'
    for (var r = 0; r < rows.length; r++) {
      html += '<tr>'
      html += '<td>' + escH(rows[r][0]) + '</td>'
      html += '<td>' + escH(rows[r][1]) + '</td>'
      html += '<td>' + escH(rows[r][2]) + '</td>'
      html += '<td class="num">' + (rows[r][3] || '') + '</td>'
      html += '<td>' + escH(rows[r][4]) + '</td>'
      html += '<td class="num">' + fmtN(rows[r][5]) + '</td>'
      html += '<td>' + escH(rows[r][6]) + '</td>'
      html += '<td class="num">' + fmtN(rows[r][7]) + '</td>'
      html += '<td class="num">' + Number(rows[r][8]).toFixed(2) + '</td>'
      html += '<td class="num">' + fmt(rows[r][9]) + '</td>'
      html += '<td class="num">' + fmtN(rows[r][10]) + '</td>'
      html += '</tr>'
    }
    html += '</table></body></html>'

    var blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = 'inventory_' + today() + '.xls'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast('Excel file downloaded')
  } catch (err) {
    toast('Export failed: ' + err.message, true)
  }
}

function exportInventoryCSV() {
  var rows = [['Product', 'HSN', 'Grade', 'Density', 'Tank', 'Qty', 'Unit', 'Base Volume (L)', 'Rate', 'Value']]
  state.inventory.forEach(function (i) {
    var qty = i.entered_qty || i.entered_kg || i.vol || 0
    var unit = i.qty_unit || (i.entered_kg ? 'kg' : 'litre')
    rows.push([i.product, i.hsn || '', i.grade || '', i.density || '', i.tank || '', qty, unit, i.vol || 0, i.cost || 0, Number(qty || 0) * Number(i.cost || 0)])
  })
  downloadCSV('inventory_' + today() + '.csv', rows)
}

function printInventoryPDF() {
  var html = '<table class="print-table"><tr><th>Product</th><th>HSN</th><th>Grade</th><th>Density</th><th>Tank</th><th>Qty</th><th>Base Volume</th><th>Rate</th><th>Value</th></tr>'
  state.inventory.forEach(function (i) {
    var qty = i.entered_qty || i.entered_kg || i.vol || 0
    var unit = i.qty_unit || (i.entered_kg ? 'kg' : 'litre')
    html += '<tr><td>' + escH(i.product) + '</td><td>' + escH(i.hsn || '-') + '</td><td>' + escH(i.grade || '-') + '</td><td>' + escH(i.density || '-') + '</td><td>' + escH(i.tank || '-') + '</td><td>' + fmtN(qty) + ' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmtN(i.vol || 0) + ' L</td><td>' + fmt(i.cost || 0) + ' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(Number(qty || 0) * Number(i.cost || 0)) + '</td></tr>'
  })
  html += '</table>'
  printHTML('Current Stock Report', html)
}

function exportTradesCSV() {
  var rows = [['Date', 'Type', 'Product', 'Party', 'Qty', 'Unit', 'Rate', 'Total', 'Terms', 'Density']]
  state.trades.forEach(function (t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0
    var unit = t.qty_unit || (t.entered_kg ? 'kg' : 'litre')
    rows.push([t.date || '', t.type || '', t.product || '', t.party || '', qty, unit, t.price || 0, Number(qty || 0) * Number(t.price || 0), t.terms || '', t.density || ''])
  })
  downloadCSV('trades_' + today() + '.csv', rows)
}

function printTradesPDF() {
  var html = '<table class="print-table"><tr><th>Date</th><th>Type</th><th>Product</th><th>Party</th><th>Qty</th><th>Rate</th><th>Total</th></tr>'
  state.trades.forEach(function (t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0
    var unit = t.qty_unit || (t.entered_kg ? 'kg' : 'litre')
    html += '<tr><td>' + escH(t.date || '') + '</td><td>' + escH(t.type || '') + '</td><td>' + escH(t.product || '') + '</td><td>' + escH(t.party || '') + '</td><td>' + fmtN(qty) + ' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(t.price || 0) + ' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(Number(qty || 0) * Number(t.price || 0)) + '</td></tr>'
  })
  html += '</table>'
  printHTML('Trade History Report', html)
}

function exportOrdersCSV() {
  var rows = [['Order ID', 'Customer', 'Product', 'Qty', 'Unit', 'Rate', 'Value', 'Status', 'Order Date', 'Due Date', 'Priority']]
  state.orders.forEach(function (o) {
    var qty = o.entered_qty || o.entered_kg || o.qty || 0
    var unit = o.qty_unit || (o.entered_kg ? 'kg' : 'litre')
    rows.push([o.id || '', o.customer || '', o.product || '', qty, unit, o.price || 0, Number(qty || 0) * Number(o.price || 0), o.status || '', o.date || '', o.due || '', o.priority || ''])
  })
  downloadCSV('orders_' + today() + '.csv', rows)
}

function printOrdersPDF() {
  var html = '<table class="print-table"><tr><th>Order ID</th><th>Customer</th><th>Product</th><th>Qty</th><th>Rate</th><th>Value</th><th>Status</th><th>Due</th></tr>'
  state.orders.forEach(function (o) {
    var qty = o.entered_qty || o.entered_kg || o.qty || 0
    var unit = o.qty_unit || (o.entered_kg ? 'kg' : 'litre')
    html += '<tr><td>' + escH(o.id || '') + '</td><td>' + escH(o.customer || '') + '</td><td>' + escH(o.product || '') + '</td><td>' + fmtN(qty) + ' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(o.price || 0) + ' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(Number(qty || 0) * Number(o.price || 0)) + '</td><td>' + escH(o.status || '') + '</td><td>' + escH(o.due || '') + '</td></tr>'
  })
  html += '</table>'
  printHTML('All Orders Report', html)
}

function getReportSummary() {
  var sales = 0
  var buys = 0

  state.trades.forEach(function (t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0
    var total = Number(qty || 0) * Number(t.price || 0)
    if (t.type === 'Sell') sales += total
    else buys += total
  })

  var profit = sales - buys
  var customerMap = {}
  state.trades.forEach(function (t) {
    if (t.type !== 'Sell') return
    var qty = t.entered_qty || t.entered_kg || t.vol || 0
    var total = Number(qty || 0) * Number(t.price || 0)
    customerMap[t.party] = (customerMap[t.party] || 0) + total
  })

  var topCustomers = Object.keys(customerMap)
    .map(function (name) { return { name: name, value: customerMap[name] } })
    .sort(function (a, b) { return b.value - a.value })

  return { sales: sales, buys: buys, profit: profit, topCustomers: topCustomers }
}

function exportReportsCSV() {
  var summary = getReportSummary()
  var rows = [
    ['REPORT SUMMARY'],
    ['Sales', summary.sales],
    ['Purchases', summary.buys],
    ['Profit', summary.profit],
    [''],
    ['TOP CUSTOMERS'],
    ['Customer', 'Revenue']
  ]

  summary.topCustomers.forEach(function (c) { rows.push([c.name, c.value]) })

  rows.push([''])
  rows.push(['TRADE DETAILS'])
  rows.push(['Date', 'Type', 'Product', 'Party', 'Qty', 'Unit', 'Rate', 'Total'])

  state.trades.forEach(function (t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0
    var unit = t.qty_unit || (t.entered_kg ? 'kg' : 'litre')
    rows.push([t.date || '', t.type || '', t.product || '', t.party || '', qty, unit, t.price || 0, Number(qty || 0) * Number(t.price || 0)])
  })

  downloadCSV('reports_' + today() + '.csv', rows)
}

function printReportsPDF() {
  var summary = getReportSummary()
  var html = ''
  html += '<table class="print-table">'
  html += '<tr><th>Total Sales</th><td>' + fmt(summary.sales) + '</td></tr>'
  html += '<tr><th>Total Purchases</th><td>' + fmt(summary.buys) + '</td></tr>'
  html += '<tr><th>Net Profit</th><td>' + fmt(summary.profit) + '</td></tr>'
  html += '</table>'

  html += '<table class="print-table">'
  html += '<tr><th>Top Customers</th><th>Revenue</th></tr>'
  summary.topCustomers.forEach(function (c) {
    html += '<tr><td>' + escH(c.name) + '</td><td>' + fmt(c.value) + '</td></tr>'
  })
  html += '</table>'

  html += '<table class="print-table">'
  html += '<tr><th>Date</th><th>Type</th><th>Product</th><th>Party</th><th>Qty</th><th>Rate</th><th>Total</th></tr>'
  state.trades.forEach(function (t) {
    var qty = t.entered_qty || t.entered_kg || t.vol || 0
    var unit = t.qty_unit || (t.entered_kg ? 'kg' : 'litre')
    html += '<tr><td>' + escH(t.date || '') + '</td><td>' + escH(t.type || '') + '</td><td>' + escH(t.product || '') + '</td><td>' + escH(t.party || '') + '</td><td>' + fmtN(qty) + ' ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(t.price || 0) + ' / ' + (unit === 'kg' ? 'KG' : 'L') + '</td><td>' + fmt(Number(qty || 0) * Number(t.price || 0)) + '</td></tr>'
  })
  html += '</table>'

  printHTML('Detailed Reports', html)
}

function renderSuppliersTable() {
  document.getElementById('suppliersTable').innerHTML = state.suppliers.map(function (s) {
    return '<tr><td><b>' + s.name + '</b></td><td>' + (s.gst || '') + '</td><td>' + (s.contact || '') + '</td><td class="mono">' + (s.phone || '') + '</td><td>' + (s.city || '') + '</td><td>' + (s.address || '') + '</td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'suppliers\',' + s.id + ')">✕</button></td></tr>'
  }).join('')
}

function renderCustomersTable() {
  document.getElementById('customersTable').innerHTML = state.customers.map(function (c) {
    return '<tr><td><b>' + c.name + '</b></td><td>' + (c.gst || '') + '</td><td>' + (c.contact || '') + '</td><td class="mono">' + (c.phone || '') + '</td><td>' + (c.city || '') + '</td><td>' + (c.address || '') + '</td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'customers\',' + c.id + ')">✕</button></td></tr>'
  }).join('')
}

var _confirmResolve = null
function customConfirm(msg) {
  document.getElementById('confirmMsg').textContent = msg
  document.getElementById('confirmModal').classList.add('show')
  return new Promise(function (r) { _confirmResolve = r })
}

document.getElementById('confirmYes').onclick = function () {
  document.getElementById('confirmModal').classList.remove('show')
  if (_confirmResolve) _confirmResolve(true)
}

document.getElementById('confirmNo').onclick = function () {
  document.getElementById('confirmModal').classList.remove('show')
  if (_confirmResolve) _confirmResolve(false)
}

async function addSupplier() {
  var n = document.getElementById('sup-name').value
  if (!n) return toast('Enter company name', true)

  var row = {
    company_id: state.currentCompanyId,
    name: n,
    gst: document.getElementById('sup-gst').value,
    contact: document.getElementById('sup-contact').value,
    phone: document.getElementById('sup-phone').value,
    city: document.getElementById('sup-city').value,
    address: document.getElementById('sup-address').value
  }

  const { data, error } = await supabase.from('suppliers').insert([row]).select().single()
  if (error) return toast(error.message, true)

  state.suppliers.push(data)
  renderSuppliersTable()
  populateTradePartySelect()
  toast('Supplier added')
}

async function addCustomer() {
  var n = document.getElementById('cust-name').value
  if (!n) return toast('Enter customer name', true)

  var row = {
    company_id: state.currentCompanyId,
    name: n,
    gst: document.getElementById('cust-gst').value,
    contact: document.getElementById('cust-contact').value,
    phone: document.getElementById('cust-phone').value,
    city: document.getElementById('cust-city').value,
    address: document.getElementById('cust-address').value
  }

  const { data, error } = await supabase.from('customers').insert([row]).select().single()
  if (error) return toast(error.message, true)

  state.customers.push(data)
  renderCustomersTable()
  populateCustomerSelect()
  populateTradePartySelect()
  toast('Customer added')
}

async function deleteItem(arr, id) {
  const tableMap = { inventory: 'inventory', trades: 'trades', suppliers: 'suppliers', customers: 'customers' }
  customConfirm('Remove this item?').then(async function (ok) {
    if (!ok) return
    const { error } = await supabase.from(tableMap[arr]).delete().eq('id', id).eq('company_id', state.currentCompanyId)
    if (error) return toast(error.message, true)

    state[arr] = state[arr].filter(function (x) { return x.id !== id })

    if (arr === 'inventory') { renderInventoryTable(); renderDashboardKpis(); renderInvLevels() }
    if (arr === 'trades') { renderTradesTable(); renderRecentTrades(); renderDashboardKpis(); renderReports() }
    if (arr === 'suppliers') { renderSuppliersTable(); populateTradePartySelect() }
    if (arr === 'customers') { renderCustomersTable(); populateCustomerSelect(); populateTradePartySelect() }

    toast('Removed')
  })
}

async function deleteOrder(id) {
  customConfirm('Delete order ' + id + '?').then(async function (ok) {
    if (!ok) return
    const { error } = await supabase.from('orders').delete().eq('id', id).eq('company_id', state.currentCompanyId)
    if (error) return toast(error.message, true)
    state.orders = state.orders.filter(function (o) { return o.id !== id })
    renderOrdersTable()
    renderActiveOrders()
    toast('Order removed')
  })
}

async function deleteChallan(id) {
  customConfirm('Delete challan ' + id + '?').then(async function (ok) {
    if (!ok) return
    const { error } = await supabase.from('challans').delete().eq('id', id).eq('company_id', state.currentCompanyId)
    if (error) return toast(error.message, true)
    state.challans = state.challans.filter(function (c) { return c.id !== id })
    renderChallansTable()
    toast('Challan removed')
  })
}

async function deleteProduct(n) {
  customConfirm('Delete product "' + n + '"?').then(async function (ok) {
    if (!ok) return
    const { error } = await supabase.from('products').delete().eq('name', n).eq('company_id', state.currentCompanyId)
    if (error) return toast(error.message, true)
    state.products = state.products.filter(function (p) { return p !== n })
    delete state.productMeta[n]
    populateSelects()
    renderProductsList()
    toast('Product removed')
  })
}

function toast(msg, isErr) {
  var el = document.getElementById('toast')
  el.textContent = msg
  el.className = 'toast show' + (isErr ? ' err' : '')
  clearTimeout(window.__toastTimer)
  window.__toastTimer = setTimeout(function () { el.classList.remove('show') }, 4000)
}

function switchPage(name) {
  document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active') })
  document.querySelectorAll('.nav-tab').forEach(function (t) { t.classList.remove('active') })
  if (window.event && window.event.target) window.event.target.classList.add('active')
  document.getElementById('page-' + name).classList.add('active')
  if (name === 'reports') renderReports()
}

window.switchPage = switchPage
window.syncUnitLabels = syncUnitLabels
window.toggleCustomTerm = toggleCustomTerm
window.openDeliveryOrderApp = openDeliveryOrderApp
window.changeCompany = changeCompany
window.addProductMaster = addProductMaster
window.deleteProduct = deleteProduct
window.handlePhotoUpload = handlePhotoUpload
window.showImage = showImage
window.addInventory = addInventory
window.clearInvForm = clearInvForm
window.renderInventoryTable = renderInventoryTable
window.addTrade = addTrade
window.renderTradesTable = renderTradesTable
window.addOrder = addOrder
window.updateOrderStatus = updateOrderStatus
window.toggleChallanFields = toggleChallanFields
window.addChallan = addChallan
window.downloadChallanPDF = downloadChallanPDF
window.shareWhatsApp = shareWhatsApp
window.addSupplier = addSupplier
window.addCustomer = addCustomer
window.deleteItem = deleteItem
window.deleteOrder = deleteOrder
window.deleteChallan = deleteChallan
window.exportInventoryExcel = exportInventoryExcel
window.printInventoryPDF = printInventoryPDF
window.exportInventoryCSV = exportInventoryCSV
window.printTradesPDF = printTradesPDF
window.exportTradesCSV = exportTradesCSV
window.printOrdersPDF = printOrdersPDF
window.exportOrdersCSV = exportOrdersCSV
window.printReportsPDF = printReportsPDF
window.exportReportsCSV = exportReportsCSV

async function init() {
  try {
    document.getElementById('tr-date').value = today()
    document.getElementById('ord-date').value = today()
    document.getElementById('ord-due').value = today()
    document.getElementById('ch-date').value = today()

    await refreshAllViews()
    toggleChallanFields()
    toggleCustomTerm('tr')

    fetchBrentPrice()
    setInterval(fetchBrentPrice, 300000)
  } catch (e) {
    console.error(e)
    toast('Failed to load data: ' + e.message, true)
  }
}

init()