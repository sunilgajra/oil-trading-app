import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const supabase = createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY)

var DEF_P = ['Crude Oil','Diesel','Petrol','Kerosene','LPG'];
var DEF_D = {'Crude Oil':0.850,'Diesel':0.832,'Petrol':0.740,'Kerosene':0.810,'LPG':0.510};

var state = {
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

async function seedDefaultsIfEmpty() {
  const { data } = await supabase.from('products').select('id').limit(1);
  if (!data || data.length === 0) {
    await supabase.from('products').insert(
      DEF_P.map(function(name){
        return { name:name, density:DEF_D[name] || null, hsn:'' };
      })
    );
  }
}

async function loadState() {
  await seedDefaultsIfEmpty();

  const [
    productsRes,
    inventoryRes,
    tradesRes,
    ordersRes,
    challansRes,
    suppliersRes,
    customersRes
  ] = await Promise.all([
    supabase.from('products').select('*').order('name'),
    supabase.from('inventory').select('*').order('id'),
    supabase.from('trades').select('*').order('date'),
    supabase.from('orders').select('*').order('date'),
    supabase.from('challans').select('*').order('date'),
    supabase.from('suppliers').select('*').order('name'),
    supabase.from('customers').select('*').order('name')
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

function downloadChallanPDF(id) {
  var c = null;
  for (var i = 0; i < state.challans.length; i++) {
    if (state.challans[i].id === id) { c = state.challans[i]; break; }
  }
  if (!c) return toast('Challan not found', true);

  var typeLabel = c.type === 'in' ? 'INWARD DELIVERY CHALLAN' : 'OUTWARD DELIVERY CHALLAN';

  var html = '' +
  '<div class="print-header">' +
      '<h1>MURJI RAVJI & CO.</h1>' +
      '<p>OIL TRADING & LOGISTICS</p>' +
  '</div>' +
  '<div class="print-title">' + escH(typeLabel) + '</div>' +
  '<table class="print-table">' +
      '<tr><th>Challan No.</th><td>' + escH(c.id) + '</td></tr>' +
      '<tr><th>Date</th><td>' + escH(c.date) + '</td></tr>' +
  '</table>' +
  '<table class="print-table">' +
      '<tr><th>Product</th><td>' + escH(c.product) + '</td></tr>' +
      '<tr><th>Volume</th><td>' + fmtN(c.vol) + ' Litres</td></tr>' +
      '<tr><th>Weight</th><td>' + (c.weight ? fmtKG(c.weight) + ' KG' : '-') + '</td></tr>' +
      '<tr><th>Density</th><td>' + (c.density || '-') + '</td></tr>' +
      '<tr><th>Transporter</th><td>' + escH(c.transporter || '-') + '</td></tr>' +
  '</table>' +
  '<table class="print-table">' +
      '<tr><th>' + (c.type==='in'?'Received From':'Dispatched From') + '</th><td>' + escH(c.from) + '</td></tr>' +
      '<tr><th>' + (c.type==='in'?'Stored At':'Delivered To') + '</th><td>' + escH(c.to) + '</td></tr>' +
  '</table>' +
  '<table class="print-table">' +
      '<tr><th>Vehicle No.</th><td>' + escH(c.vehicle) + '</td></tr>' +
      '<tr><th>Driver Name</th><td>' + escH(c.driver) + '</td></tr>' +
      '<tr><th>Driver Phone</th><td>' + escH(c.driverPh) + '</td></tr>' +
  '</table>' +
  '<div class="print-footer">' +
      '<div class="sig-block"><div class="sig-line">Authorized Signatory</div></div>' +
      '<div class="sig-block"><div class="sig-line">Receiver Signature</div></div>' +
  '</div>' +
  '<div class="print-note">This is a computer-generated document from Murji Ravji & Co. — ' + new Date().toLocaleString('en-IN') + '</div>';

  document.getElementById('printZone').innerHTML = html;
  toast('Opening print dialog — select "Save as PDF"');
  setTimeout(function(){ window.print(); }, 300);
}

function exportInventoryExcel() {
  try {
    var rows = state.inventory.map(function(i) {
      return [
        i.product,
        i.hsn || '-',
        i.grade || '-',
        i.density || '',
        i.tank || '-',
        i.vol,
        i.density ? toKG(i.vol, i.density) : '',
        i.cost,
        i.vol * i.cost,
        i.threshold
      ];
    });

    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
    html += '<head><meta charset="UTF-8"><style>td,th{padding:6px 10px;border:1px solid #999;font-size:12px;font-family:Calibri,sans-serif;}th{background:#d4e6b5;font-weight:bold;color:#1a5c2e;}.num{text-align:right;}</style></head><body>';
    html += '<table>';
    html += '<tr><th>Product</th><th>HSN</th><th>Grade</th><th>Density (kg/L)</th><th>Tank</th><th>Volume (L)</th><th>Weight (KG)</th><th>Cost/L (₹)</th><th>Total Value (₹)</th><th>Threshold (KG)</th></tr>';
    for (var r = 0; r < rows.length; r++) {
      html += '<tr>';
      html += '<td>' + escH(rows[r][0]) + '</td>';
      html += '<td>' + escH(rows[r][1]) + '</td>';
      html += '<td>' + escH(rows[r][2]) + '</td>';
      html += '<td class="num">' + (rows[r][3] || '') + '</td>';
      html += '<td>' + escH(rows[r][4]) + '</td>';
      html += '<td class="num">' + fmtN(rows[r][5]) + '</td>';
      html += '<td class="num">' + (rows[r][6] !== '' ? fmtKG(rows[r][6]) : '') + '</td>';
      html += '<td class="num">' + Number(rows[r][7]).toFixed(2) + '</td>';
      html += '<td class="num">' + fmt(rows[r][8]) + '</td>';
      html += '<td class="num">' + fmtN(rows[r][9]) + '</td>';
      html += '</tr>';
    }
    html += '</table></body></html>';

    var blob = new Blob([html], {type: 'application/vnd.ms-excel;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'MurjiRavji_Inventory_' + today() + '.xls';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Excel file downloaded');
  } catch (err) {
    toast('Export failed: ' + err.message, true);
  }
}

function shareWhatsApp(id) {
  var c = null;
  for (var i = 0; i < state.challans.length; i++) {
    if (state.challans[i].id === id) { c = state.challans[i]; break; }
  }
  if (!c) return toast('Challan not found', true);
  var text = '*MURJI RAVJI & CO.*\nChallan: ' + c.id + '\nDate: ' + c.date +
    '\nProduct: ' + c.product + '\nVol: ' + fmtN(c.vol) + ' L\nWeight: ' + (c.weight ? fmtKG(c.weight) + ' KG' : '-') +
    '\nTransporter: ' + (c.transporter || '-') +
    '\nFrom: ' + (c.from||'-') + '\nTo: ' + (c.to||'-') + '\nVehicle: ' + c.vehicle;
  window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
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

var VOL_MAP = {
  inv:{volId:'inv-vol',kgId:'inv-kg',denId:'inv-density'},
  tr:{volId:'tr-vol',kgId:'tr-kg',denId:'tr-density'},
  ord:{volId:'ord-qty',kgId:'ord-kg',denId:'ord-density'},
  ch:{volId:'ch-vol',kgId:'ch-kg',denId:'ch-density'}
};

var PRICE_MAP = {
  inv:{perLId:'inv-cost',perKGId:'inv-cost-kg'},
  tr:{perLId:'tr-price',perKGId:'tr-price-kg'},
  ord:{perLId:'ord-price',perKGId:'ord-price-kg'}
};

var _lk = {};

function dualCalc(px, ch) {
  var m = VOL_MAP[px];
  if (_lk[px]) return;
  _lk[px] = true;

  var d = parseFloat(document.getElementById(m.denId).value);
  var vEl = document.getElementById(m.volId), kEl = document.getElementById(m.kgId);

  if (!d) {
    setTimeout(function(){ _lk[px] = false; }, 60);
    return;
  }

  if (ch === 'vol') {
    var v = parseFloat(vEl.value)||0;
    kEl.value = v>0 ? toKG(v,d).toFixed(1) : '';
  } else {
    var kg = parseFloat(kEl.value)||0;
    vEl.value = kg>0 ? (kg/d).toFixed(1) : '';
  }

  setTimeout(function(){ _lk[px] = false; }, 60);
}

function priceCalc(px, ch) {
  var m = PRICE_MAP[px];
  if (_lk['p_'+px]) return;
  _lk['p_'+px] = true;

  var d = parseFloat(document.getElementById(VOL_MAP[px].denId).value);
  var lEl = document.getElementById(m.perLId), kEl = document.getElementById(m.perKGId);

  if (!d) {
    setTimeout(function(){ _lk['p_'+px] = false; }, 60);
    return;
  }

  if (ch === 'perL') {
    var pl = parseFloat(lEl.value)||0;
    kEl.value = pl>0 ? (pl*d).toFixed(2) : '';
  } else {
    var pkg = parseFloat(kEl.value)||0;
    lEl.value = pkg>0 ? (pkg/d).toFixed(2) : '';
  }

  setTimeout(function(){ _lk['p_'+px] = false; }, 60);
}

function onDensityChangeForPrice(px) {
  _lk[px] = false;
  _lk['p_'+px] = false;
}

function toggleCustomTerm(px) {
  var sel = document.getElementById(px+'-terms');
  var cust = document.getElementById(px+'-custom-term');
  if (sel.value === '__custom__') cust.classList.add('show');
  else cust.classList.remove('show');
}

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
    ts += Number(state.inventory[i].vol) * Number(state.inventory[i].cost);
    totalKG += toKG(Number(state.inventory[i].vol), state.inventory[i].density);
  }
  var totalMT = totalKG / 1000;

  var sl = 0;
  for (var j = 0; j < state.trades.length; j++) {
    if (state.trades[j].type === 'Sell') sl += Number(state.trades[j].vol) * Number(state.trades[j].price);
  }

  document.getElementById('kpiGrid').innerHTML =
    kpiC('Inventory Value', fmt(ts), 'Total Stock') +
    kpiC('Volume', fmtKG(totalKG) + ' KG / ' + totalMT.toFixed(2) + ' MT', 'By weight') +
    kpiC('Sales', fmt(sl), 'Revenue');
}

function renderInvLevels() {
  document.getElementById('invLevels').innerHTML = state.inventory.map(function(i) {
    var kg = toKG(Number(i.vol), i.density);
    var threshold = Number(i.threshold || 0);
    var p = threshold > 0 ? Math.min(100, Math.round(kg / (threshold * 10) * 100)) : 0;
    var c = p > 50 ? 'green' : p > 25 ? '' : 'red';
    return '<div class="progress-wrap"><div class="progress-label"><span>'+i.product+'</span><span class="mono">'+(kg ? fmtKG(kg) + ' KG' : fmtN(i.vol) + ' L')+'</span></div><div class="progress"><div class="progress-fill '+c+'" style="width:'+p+'%"></div></div></div>';
  }).join('');
}

function renderRecentTrades() {
  document.getElementById('recentTradesTbl').innerHTML = state.trades.slice(-5).reverse().map(function(t) {
    return '<tr><td>'+t.product+'</td><td><span class="badge '+(t.type==='Buy'?'badge-blue':'badge-green')+'">'+t.type+'</span></td><td class="mono">'+fmtN(t.vol)+'</td><td class="mono">'+(t.density ? fmtKG(toKG(t.vol,t.density)) : '-')+'</td><td class="mono">'+fmt(t.price)+'</td><td class="mono">'+fmt(Number(t.vol)*Number(t.price))+'</td></tr>';
  }).join('');
}

function renderActiveOrders() {
  document.getElementById('activeOrdersTbl').innerHTML = state.orders.filter(function(o){ return o.status !== 'Delivered'; }).map(function(o) {
    return '<tr><td class="mono">'+o.id+'</td><td>'+o.customer+'</td><td>'+o.product+'</td><td class="mono">'+fmtN(o.qty)+'</td><td class="mono">'+fmt(Number(o.qty)*Number(o.price))+'</td><td>'+statusBadge(o.status)+'</td><td class="mono">'+(o.due || '')+'</td></tr>';
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
    var kg = i.density ? toKG(i.vol, i.density) : 0;
    var threshold = Number(i.threshold || 0);
    var lvPct = threshold > 0 ? Math.min(100, kg / threshold * 10) : 0;
    return '<tr><td><b>'+i.product+'</b></td><td>'+(i.hsn || '-')+'</td><td>'+i.grade+'</td><td class="mono">'+(i.density || '-')+'</td><td>'+i.tank+'</td><td class="mono">'+fmtN(i.vol)+'</td><td class="mono">'+(i.density ? fmtKG(kg) : '-')+'</td><td class="mono">'+fmt(i.cost)+'</td><td class="mono">'+fmt(Number(i.vol)*Number(i.cost))+'</td><td><div class="progress" style="width:60px"><div class="progress-fill '+(kg > threshold ? 'green':'red')+'" style="width:'+lvPct+'%"></div></div></td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'inventory\','+i.id+')">✕</button></td></tr>';
  }).join('');
}

async function addInventory() {
  var product = document.getElementById('inv-product').value;
  var vol = parseFloat(document.getElementById('inv-vol').value);
  var cost = parseFloat(document.getElementById('inv-cost').value);
  var densityInput = document.getElementById('inv-density').value.trim();
  var density = densityInput ? parseFloat(densityInput) : null;

  if (!vol || !cost) return toast('Please fill quantity and price', true);

  var meta = state.productMeta[product] || {};

  var row = {
    product: product,
    hsn: document.getElementById('inv-hsn').value.trim() || meta.hsn || '-',
    grade: document.getElementById('inv-grade').value || '-',
    tank: document.getElementById('inv-tank').value || '-',
    vol: vol,
    cost: cost,
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
  ['inv-hsn','inv-grade','inv-vol','inv-kg','inv-cost','inv-cost-kg','inv-tank','inv-thresh','inv-density'].forEach(function(id){
    document.getElementById(id).value='';
  });
  document.getElementById('inv-slip-preview').innerHTML = '<div class="photo-placeholder">📷</div>';
}

function renderTradesTable() {
  document.getElementById('tradesTable').innerHTML = state.trades.slice().reverse().map(function(t) {
    return '<tr><td class="mono">'+t.date+'</td><td><span class="badge '+(t.type==='Buy'?'badge-blue':'badge-green')+'">'+t.type+'</span></td><td>'+t.product+'</td><td>'+t.party+'</td><td class="mono">'+fmtN(t.vol)+'</td><td class="mono">'+fmt(t.price)+'</td><td class="mono">'+fmt(Number(t.vol)*Number(t.price))+'</td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'trades\','+t.id+')">✕</button></td></tr>';
  }).join('');
}

async function addTrade() {
  var type = document.getElementById('tr-type').value;
  var product = document.getElementById('tr-product').value;
  var party = document.getElementById('tr-party').value;
  var vol = parseFloat(document.getElementById('tr-vol').value);
  var price = parseFloat(document.getElementById('tr-price').value);
  var densityInput = document.getElementById('tr-density').value.trim();
  var density = densityInput ? parseFloat(densityInput) : null;

  if (!party || !vol || !price) return toast('Please fill all required fields', true);

  var termsVal = document.getElementById('tr-terms').value;
  if (termsVal === '__custom__') termsVal = document.getElementById('tr-custom-term-val').value || 'Custom';

  var row = {
    type: type,
    product: product,
    party: party,
    vol: vol,
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
  toast('Trade recorded');
}

function renderOrdersTable() {
  document.getElementById('ordersTable').innerHTML = state.orders.slice().reverse().map(function(o) {
    return '<tr><td class="mono">'+o.id+'</td><td><b>'+o.customer+'</b></td><td>'+o.product+'</td><td class="mono">'+fmtN(o.qty)+'</td><td class="mono">'+fmt(Number(o.qty)*Number(o.price))+'</td><td>'+statusBadge(o.status)+'</td><td class="mono">'+(o.due||'')+'</td><td style="display:flex;gap:4px"><select onchange="updateOrderStatus(\''+o.id+'\',this.value)" style="font-size:10px;background:var(--bg);color:var(--text);border:1px solid var(--border)"><option '+(o.status==='Pending'?'selected':'')+'>Pending</option><option '+(o.status==='Dispatched'?'selected':'')+'>Dispatched</option><option '+(o.status==='Delivered'?'selected':'')+'>Delivered</option></select><button class="btn btn-danger btn-sm" onclick="deleteOrder(\''+o.id+'\')">✕</button></td></tr>';
  }).join('');
}

async function addOrder() {
  var customer = document.getElementById('ord-customer').value;
  var product = document.getElementById('ord-product').value;
  var qty = parseFloat(document.getElementById('ord-qty').value);
  var price = parseFloat(document.getElementById('ord-price').value);
  var densityInput = document.getElementById('ord-density').value.trim();
  var density = densityInput ? parseFloat(densityInput) : null;

  if (!customer || !qty || !price) return toast('Please fill all required fields', true);

  const { data: lastOrders } = await supabase.from('orders').select('id').order('created_at', { ascending:false }).limit(1);
  var nextNum = 1;
  if (lastOrders && lastOrders.length) {
    var m = String(lastOrders[0].id).match(/ORD-(\d+)/);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }
  var id = 'ORD-' + String(nextNum).padStart(3, '0');

  var row = {
    id: id,
    customer: customer,
    product: product,
    qty: qty,
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
  const { error } = await supabase.from('orders').update({ status: s }).eq('id', id);
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
    return '<tr><td class="mono"><b>'+c.id+'</b></td><td>'+(c.type==='in'?'<span class="badge badge-teal">In</span>':'<span class="badge badge-green">Out</span>')+'</td><td class="mono">'+c.date+'</td><td>'+c.product+'</td><td class="mono">'+fmtN(c.vol)+'</td><td>'+(c.transporter||'-')+'</td><td>'+(c.from||'-')+'</td><td>'+(c.to||'-')+'</td><td class="mono">'+c.vehicle+'</td><td style="display:flex;gap:4px"><button class="btn btn-primary btn-sm" onclick="downloadChallanPDF(\''+c.id+'\')">PDF</button><button class="btn btn-green btn-sm" onclick="shareWhatsApp(\''+c.id+'\')">WA</button><button class="btn btn-danger btn-sm" onclick="deleteChallan(\''+c.id+'\')">✕</button></td></tr>';
  }).join('');
}

async function addChallan() {
  var type = document.getElementById('ch-type').value;
  var no = document.getElementById('ch-no').value.trim();

  if (!no) {
    const { data: lastRows } = await supabase.from('challans').select('id').order('created_at', { ascending:false }).limit(1);
    var nextNum = 1;
    if (lastRows && lastRows.length) {
      var m = String(lastRows[0].id).match(/CH-(\d+)/);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    no = 'CH-' + String(nextNum).padStart(3, '0');
  }

  var product = document.getElementById('ch-product').value;
  var densityInput = document.getElementById('ch-density').value.trim();
  var density = densityInput ? parseFloat(densityInput) : null;
  var vol = parseFloat(document.getElementById('ch-vol').value);

  if (!vol) return toast('Enter quantity', true);

  var row = {
    id: no,
    type: type,
    date: document.getElementById('ch-date').value || today(),
    product: product,
    vol: vol,
    density: density,
    weight: density ? toKG(vol, density) : null,
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
    if (t.type === 'Sell') sales += Number(t.vol) * Number(t.price);
    else buys += Number(t.vol) * Number(t.price);
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
    if (tr.type === 'Sell') cust[tr.party] = (cust[tr.party]||0) + (Number(tr.vol) * Number(tr.price));
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
    const { error } = await supabase.from(tableMap[arr]).delete().eq('id', id);
    if (error) return toast(error.message, true);

    state[arr] = state[arr].filter(function(x){ return x.id !== id; });

    if (arr === 'inventory') { renderInventoryTable(); renderDashboardKpis(); renderInvLevels(); }
    if (arr === 'trades') { renderTradesTable(); renderRecentTrades(); renderDashboardKpis(); }
    if (arr === 'suppliers') { renderSuppliersTable(); populateTradePartySelect(); }
    if (arr === 'customers') { renderCustomersTable(); populateCustomerSelect(); populateTradePartySelect(); }

    toast('Removed');
  });
}

async function deleteOrder(id) {
  customConfirm('Delete order ' + id + '?').then(async function(ok) {
    if (!ok) return;
    const { error } = await supabase.from('orders').delete().eq('id', id);
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
    const { error } = await supabase.from('challans').delete().eq('id', id);
    if (error) return toast(error.message, true);
    state.challans = state.challans.filter(function(c){ return c.id !== id; });
    renderChallansTable();
    toast('Challan removed');
  });
}

async function deleteProduct(n) {
  customConfirm('Delete product "' + n + '"?').then(async function(ok) {
    if (!ok) return;
    const { error } = await supabase.from('products').delete().eq('name', n);
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
window.addProductMaster = addProductMaster;
window.deleteProduct = deleteProduct;
window.dualCalc = dualCalc;
window.priceCalc = priceCalc;
window.onDensityChangeForPrice = onDensityChangeForPrice;
window.toggleCustomTerm = toggleCustomTerm;
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

async function init() {
  try {
    document.getElementById('tr-date').value = today();
    document.getElementById('ord-date').value = today();
    document.getElementById('ord-due').value = today();
    document.getElementById('ch-date').value = today();

    await loadState();

    populateSelects();
    populateCustomerSelect();
    populateTradePartySelect();
    renderProductsList();
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
    toggleChallanFields();

    fetchBrentPrice();
    setInterval(fetchBrentPrice, 300000);
  } catch (e) {
    console.error(e);
    toast('Failed to load Supabase data: ' + e.message, true);
  }
}
init();