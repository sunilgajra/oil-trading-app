/* ═══════ STATE & CONFIG ═══════ */
var DEF_P = ['Crude Oil','Diesel','Petrol','Kerosene','LPG'];
var DEF_D = {'Crude Oil':0.850,'Diesel':0.832,'Petrol':0.740,'Kerosene':0.810,'LPG':0.510};
var DEF_S = {
  products: DEF_P.slice(), densities: Object.assign({}, DEF_D),
  inventory:[
    {id:1,product:'Diesel',grade:'EN590',tank:'Tank A',vol:85000,cost:92.5,threshold:10000,density:0.832,slip:null},
    {id:2,product:'Petrol',grade:'91 RON',tank:'Tank B',vol:62000,cost:104.2,threshold:8000,density:0.740,slip:null},
  ],
  trades:[
    {id:1,type:'Buy',product:'Diesel',party:'IndianOil Corp',vol:50000,price:91.0,date:'2025-06-20',terms:'Net 30',density:0.832},
    {id:2,type:'Sell',product:'Diesel',party:'Metro Transports',vol:20000,price:98.5,date:'2025-06-22',terms:'Net 15',density:0.832},
  ],
  orders:[
    {id:'ORD-001',customer:'Metro Transports',product:'Diesel',qty:20000,price:98.5,date:'2025-06-22',due:'2025-07-10',addr:'Mumbai Depot',priority:'Normal',status:'Dispatched',density:0.832,terms:'Net 15'},
  ],
  challans:[
    {id:'CH-001',type:'out',date:'2025-06-22',product:'Diesel',vol:20000,density:0.832,weight:16640,from:'Mumbai Depot',to:'Metro Transports',vehicle:'MH 12 AB 1234',driver:'Ramesh',driverPh:'+91 98765 43210'},
  ],
  suppliers:[
    {id:1,name:'IndianOil Corp',contact:'Rajesh Sharma',phone:'+91 98201 11111',city:'Mumbai'},
  ],
  nextInvId:3, nextTradeId:3, nextOrderNum:2, nextSupId:2, nextChNum:2
};

var state;
function loadState(){try{var s=localStorage.getItem('murji_oil_v12');if(s){state=JSON.parse(s);return;}}catch(e){}state=JSON.parse(JSON.stringify(DEF_S));}
function saveState(){try{localStorage.setItem('murji_oil_v12',JSON.stringify(state));}catch(e){}}
loadState();

var fmt=function(n){return'\u20B9'+Number(n).toLocaleString('en-IN',{maximumFractionDigits:2});};
var fmtN=function(n){return Number(n).toLocaleString('en-IN');};
var fmtKG=function(n){return Number(n).toLocaleString('en-IN',{maximumFractionDigits:1});};
var today=function(){return new Date().toISOString().split('T')[0];};
var getDensity=function(p){return state.densities[p]||0.850;};
var toKG=function(v,d){return v*(d||0.85);};
var escH=function(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');};

/* ═══════ PDF — Pure print approach ═══════ */
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
        '<tr><th>Weight</th><td>' + fmtKG(c.weight) + ' KG</td></tr>' +
        '<tr><th>Density</th><td>' + c.density + ' kg/L</td></tr>' +
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

/* ═══════ EXCEL — Pure Blob approach ═══════ */
function exportInventoryExcel() {
    try {
        var rows = state.inventory.map(function(i) {
            return [
                i.product,
                i.grade || '-',
                i.density,
                i.tank || '-',
                i.vol,
                toKG(i.vol, i.density),
                i.cost,
                i.vol * i.cost,
                i.threshold
            ];
        });

        var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">';
        html += '<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Inventory</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->';
        html += '<style>td,th{padding:6px 10px;border:1px solid #999;font-size:12px;font-family:Calibri,sans-serif;}th{background:#d4e6b5;font-weight:bold;color:#1a5c2e;}.num{text-align:right;}</style></head><body>';
        html += '<table>';
        html += '<tr><th>Product</th><th>Grade</th><th>Density (kg/L)</th><th>Tank</th><th>Volume (L)</th><th>Weight (KG)</th><th>Cost/L (&#x20B9;)</th><th>Total Value (&#x20B9;)</th><th>Threshold (L)</th></tr>';
        for (var r = 0; r < rows.length; r++) {
            html += '<tr>';
            html += '<td>' + escH(rows[r][0]) + '</td>';
            html += '<td>' + escH(rows[r][1]) + '</td>';
            html += '<td class="num">' + rows[r][2] + '</td>';
            html += '<td>' + escH(rows[r][3]) + '</td>';
            html += '<td class="num">' + fmtN(rows[r][4]) + '</td>';
            html += '<td class="num">' + fmtKG(rows[r][5]) + '</td>';
            html += '<td class="num">' + rows[r][6].toFixed(2) + '</td>';
            html += '<td class="num">' + fmt(rows[r][7]) + '</td>';
            html += '<td class="num">' + fmtN(rows[r][8]) + '</td>';
            html += '</tr>';
        }
        var totalVol = 0, totalVal = 0;
        for (var r = 0; r < rows.length; r++) { totalVol += rows[r][4]; totalVal += rows[r][7]; }
        html += '<tr style="font-weight:bold;background:#eee"><td>TOTAL</td><td></td><td></td><td></td><td class="num">' + fmtN(totalVol) + '</td><td></td><td></td><td class="num">' + fmt(totalVal) + '</td><td></td></tr>';
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
        console.error('Excel Error:', err);
        toast('Export failed: ' + err.message, true);
    }
}

/* ═══════ WHATSAPP SHARE ═══════ */
function shareWhatsApp(id) {
    var c = null;
    for (var i = 0; i < state.challans.length; i++) {
        if (state.challans[i].id === id) { c = state.challans[i]; break; }
    }
    if (!c) return toast('Challan not found', true);
    var text = '*MURJI RAVJI & CO.*\nChallan: ' + c.id + '\nDate: ' + c.date +
        '\nProduct: ' + c.product + '\nVol: ' + fmtN(c.vol) + ' L\nWeight: ' + fmtKG(c.weight) + ' KG' +
        '\nFrom: ' + (c.from||'-') + '\nTo: ' + (c.to||'-') + '\nVehicle: ' + c.vehicle;
    window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
}

/* ═══════ CORE UI LOGIC ═══════ */
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
    var m = VOL_MAP[px]; if (_lk[px]) return; _lk[px] = true;
    var d = parseFloat(document.getElementById(m.denId).value) || 0.85;
    var vEl = document.getElementById(m.volId), kEl = document.getElementById(m.kgId);
    if (ch === 'vol') { var v = parseFloat(vEl.value)||0; kEl.value = v>0 ? toKG(v,d).toFixed(1) : ''; }
    else { var kg = parseFloat(kEl.value)||0; vEl.value = kg>0 ? (kg/d).toFixed(1) : ''; }
    setTimeout(function(){ _lk[px] = false; }, 60);
}
function priceCalc(px, ch) {
    var m = PRICE_MAP[px]; if (_lk['p_'+px]) return; _lk['p_'+px] = true;
    var d = parseFloat(document.getElementById(VOL_MAP[px].denId).value) || 0.85;
    var lEl = document.getElementById(m.perLId), kEl = document.getElementById(m.perKGId);
    if (ch === 'perL') { var pl = parseFloat(lEl.value)||0; kEl.value = pl>0 ? (pl*d).toFixed(2) : ''; }
    else { var pkg = parseFloat(kEl.value)||0; lEl.value = pkg>0 ? (pkg/d).toFixed(2) : ''; }
    setTimeout(function(){ _lk['p_'+px] = false; }, 60);
}
function onDensityChangeForPrice(px) { _lk[px] = false; _lk['p_'+px] = false; }
function toggleCustomTerm(px) {
    var sel = document.getElementById(px+'-terms');
    var cust = document.getElementById(px+'-custom-term');
    if (sel.value === '__custom__') cust.classList.add('show');
    else cust.classList.remove('show');
}

/* ═══════ RENDER FUNCTIONS ═══════ */
function kpiC(label, val, sub) {
    return '<div class="kpi"><div class="kpi-label">'+label+'</div><div class="kpi-value">'+val+'</div><div class="kpi-change">'+sub+'</div></div>';
}
function statusBadge(s) {
    var m = {'Pending':'badge-gold','Dispatched':'badge-blue','Delivered':'badge-green'};
    return '<span class="badge '+(m[s]||'badge-gray')+'">'+s+'</span>';
}

function renderDashboardKpis() {
    var ts = 0, tv = 0;
    for (var i = 0; i < state.inventory.length; i++) {
        ts += state.inventory[i].vol * state.inventory[i].cost;
        tv += state.inventory[i].vol;
    }
    var sl = 0;
    for (var i = 0; i < state.trades.length; i++) {
        if (state.trades[i].type === 'Sell') sl += state.trades[i].vol * state.trades[i].price;
    }
    document.getElementById('kpiGrid').innerHTML =
        kpiC('Inventory Value', fmt(ts), 'Total Stock') +
        kpiC('Volume', fmtN(tv) + ' L', 'Litres') +
        kpiC('Sales', fmt(sl), 'Revenue');
}
function renderInvLevels() {
    document.getElementById('invLevels').innerHTML = state.inventory.map(function(i) {
        var p = Math.min(100, Math.round(i.vol / (i.threshold * 10) * 100));
        var c = p > 50 ? 'green' : p > 25 ? '' : 'red';
        return '<div class="progress-wrap"><div class="progress-label"><span>'+i.product+'</span><span class="mono">'+fmtN(i.vol)+' L</span></div><div class="progress"><div class="progress-fill '+c+'" style="width:'+p+'%"></div></div></div>';
    }).join('');
}
function renderRecentTrades() {
    document.getElementById('recentTradesTbl').innerHTML = state.trades.slice(-5).reverse().map(function(t) {
        return '<tr><td>'+t.product+'</td><td><span class="badge '+(t.type==='Buy'?'badge-blue':'badge-green')+'">'+t.type+'</span></td><td class="mono">'+fmtN(t.vol)+'</td><td class="mono">'+fmtKG(toKG(t.vol,t.density))+'</td><td class="mono">'+fmt(t.price)+'</td><td class="mono">'+fmt(t.vol*t.price)+'</td></tr>';
    }).join('');
}
function renderActiveOrders() {
    document.getElementById('activeOrdersTbl').innerHTML = state.orders.filter(function(o){return o.status!=='Delivered';}).map(function(o) {
        return '<tr><td class="mono">'+o.id+'</td><td>'+o.customer+'</td><td>'+o.product+'</td><td class="mono">'+fmtN(o.qty)+'</td><td class="mono">'+fmt(o.qty*o.price)+'</td><td>'+statusBadge(o.status)+'</td><td class="mono">'+o.due+'</td></tr>';
    }).join('');
}

function populateSelects() {
    ['inv-product','tr-product','ord-product','ch-product'].forEach(function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        el.innerHTML = state.products.map(function(p){ return '<option>'+p+'</option>'; }).join('');
    });
}
function renderProductsList() {
    document.getElementById('productsList').innerHTML = state.products.map(function(p) {
        return '<div class="product-tag"><span>'+p+'</span><span class="remove-prod" onclick="deleteProduct(\''+p.replace(/'/g,"\\'")+'\')">&#x2715;</span></div>';
    }).join('');
}

function renderInventoryTable() {
    var q = document.getElementById('invSearch').value.toLowerCase();
    document.getElementById('invTable').innerHTML = state.inventory.filter(function(i){return i.product.toLowerCase().indexOf(q) >= 0;}).map(function(i) {
        var lvPct = Math.min(100, i.vol / i.threshold * 10);
        return '<tr><td><b>'+i.product+'</b></td><td>'+i.grade+'</td><td class="mono">'+i.density+'</td><td>'+i.tank+'</td><td class="mono">'+fmtN(i.vol)+'</td><td class="mono">'+fmtKG(toKG(i.vol,i.density))+'</td><td class="mono">'+fmt(i.cost)+'</td><td class="mono">'+fmt(i.vol*i.cost)+'</td><td><div class="progress" style="width:60px"><div class="progress-fill '+(i.vol>i.threshold?'green':'red')+'" style="width:'+lvPct+'%"></div></div></td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'inventory\','+i.id+')">&#x2715;</button></td></tr>';
    }).join('');
}

function addInventory() {
    var product = document.getElementById('inv-product').value;
    var vol = parseFloat(document.getElementById('inv-vol').value);
    var cost = parseFloat(document.getElementById('inv-cost').value);

    if (!vol || !cost) {
        toast('Please fill quantity and price', true);
        return;
    }

    state.inventory.push({
        id: state.nextInvId++,
        product: product,
        grade: document.getElementById('inv-grade').value || '-',
        tank: document.getElementById('inv-tank').value || '-',
        vol: vol,
        cost: cost,
        threshold: parseFloat(document.getElementById('inv-thresh').value) || 1000,
        density: parseFloat(document.getElementById('inv-density').value) || getDensity(product),
        slip: document.getElementById('inv-slip').dataset.base64 || null
    });

    saveState();
    renderInventoryTable();
    renderDashboardKpis();
    renderInvLevels();
    clearInvForm();
    toast('Stock added successfully ✅');
}

function clearInvForm() {
    ['inv-grade','inv-vol','inv-kg','inv-cost','inv-cost-kg','inv-tank','inv-thresh'].forEach(function(id){document.getElementById(id).value='';});
    document.getElementById('inv-slip-preview').innerHTML = '<div class="photo-placeholder">&#x1F4F7;</div>';
}

function renderTradesTable() {
    document.getElementById('tradesTable').innerHTML = state.trades.slice().reverse().map(function(t) {
        return '<tr><td class="mono">'+t.date+'</td><td><span class="badge '+(t.type==='Buy'?'badge-blue':'badge-green')+'">'+t.type+'</span></td><td>'+t.product+'</td><td>'+t.party+'</td><td class="mono">'+fmtN(t.vol)+'</td><td class="mono">'+fmt(t.price)+'</td><td class="mono">'+fmt(t.vol*t.price)+'</td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'trades\','+t.id+')">&#x2715;</button></td></tr>';
    }).join('');
}
function addTrade() {
    var type = document.getElementById('tr-type').value;
    var product = document.getElementById('tr-product').value;
    var party = document.getElementById('tr-party').value;
    var vol = parseFloat(document.getElementById('tr-vol').value);
    var price = parseFloat(document.getElementById('tr-price').value);
    if (!party || !vol || !price) return toast('Please fill all required fields', true);
    var termsVal = document.getElementById('tr-terms').value;
    if (termsVal === '__custom__') termsVal = document.getElementById('tr-custom-term-val').value || 'Custom';
    state.trades.push({
        id: state.nextTradeId++,
        type: type, product: product, party: party,
        vol: vol, price: price,
        date: document.getElementById('tr-date').value || today(),
        terms: termsVal,
        density: parseFloat(document.getElementById('tr-density').value) || getDensity(product)
    });
    saveState(); renderTradesTable(); renderRecentTrades(); renderDashboardKpis();
    toast('Trade recorded');
}

function renderOrdersTable() {
    document.getElementById('ordersTable').innerHTML = state.orders.slice().reverse().map(function(o) {
        return '<tr><td class="mono">'+o.id+'</td><td><b>'+o.customer+'</b></td><td>'+o.product+'</td><td class="mono">'+fmtN(o.qty)+'</td><td class="mono">'+fmt(o.qty*o.price)+'</td><td>'+statusBadge(o.status)+'</td><td class="mono">'+o.due+'</td><td style="display:flex;gap:4px"><select onchange="updateOrderStatus(\''+o.id+'\',this.value)" style="font-size:10px;background:var(--bg);color:var(--text);border:1px solid var(--border)"><option '+(o.status==='Pending'?'selected':'')+'>Pending</option><option '+(o.status==='Dispatched'?'selected':'')+'>Dispatched</option><option '+(o.status==='Delivered'?'selected':'')+'>Delivered</option></select><button class="btn btn-danger btn-sm" onclick="deleteOrder(\''+o.id+'\')">&#x2715;</button></td></tr>';
    }).join('');
}
function addOrder() {
    var customer = document.getElementById('ord-customer').value;
    var product = document.getElementById('ord-product').value;
    var qty = parseFloat(document.getElementById('ord-qty').value);
    var price = parseFloat(document.getElementById('ord-price').value);
    if (!customer || !qty || !price) return toast('Please fill all required fields', true);
    var id = 'ORD-' + String(state.nextOrderNum++).padStart(3, '0');
    state.orders.push({
        id: id, customer: customer, product: product, qty: qty, price: price,
        date: today(), due: document.getElementById('ord-due').value,
        addr: '', priority: document.getElementById('ord-priority').value,
        status: 'Pending',
        density: parseFloat(document.getElementById('ord-density').value) || getDensity(product),
        terms: 'Immediate'
    });
    saveState(); renderOrdersTable(); renderActiveOrders(); toast('Created ' + id);
}
function updateOrderStatus(id, s) {
    for (var i = 0; i < state.orders.length; i++) {
        if (state.orders[i].id === id) { state.orders[i].status = s; break; }
    }
    saveState(); renderOrdersTable(); renderActiveOrders(); toast('Status updated');
}

function toggleChallanFields() {
    var t = document.getElementById('ch-type').value;
    document.getElementById('ch-from-group').querySelector('label').textContent = t==='in' ? 'Received From' : 'Dispatched From';
    document.getElementById('ch-to-group').querySelector('label').textContent = t==='in' ? 'Stored At' : 'Delivered To';
}
function renderChallansTable() {
    document.getElementById('challansTable').innerHTML = state.challans.slice().reverse().map(function(c) {
        return '<tr><td class="mono"><b>'+c.id+'</b></td><td>'+(c.type==='in'?'<span class="badge badge-teal">In</span>':'<span class="badge badge-green">Out</span>')+'</td><td class="mono">'+c.date+'</td><td>'+c.product+'</td><td class="mono">'+fmtN(c.vol)+'</td><td>'+(c.from||'-')+'</td><td>'+(c.to||'-')+'</td><td class="mono">'+c.vehicle+'</td><td style="display:flex;gap:4px"><button class="btn btn-primary btn-sm" onclick="downloadChallanPDF(\''+c.id+'\')">PDF</button><button class="btn btn-green btn-sm" onclick="shareWhatsApp(\''+c.id+'\')">WA</button><button class="btn btn-danger btn-sm" onclick="deleteChallan(\''+c.id+'\')">&#x2715;</button></td></tr>';
    }).join('');
}
function addChallan() {
    var type = document.getElementById('ch-type').value;
    var no = document.getElementById('ch-no').value.trim();
    if (!no) no = 'CH-' + String(state.nextChNum).padStart(3, '0');
    var product = document.getElementById('ch-product').value;
    var density = parseFloat(document.getElementById('ch-density').value) || getDensity(product);
    var vol = parseFloat(document.getElementById('ch-vol').value);
    if (!vol) return toast('Enter quantity', true);
    state.challans.push({
        id: no, type: type,
        date: document.getElementById('ch-date').value || today(),
        product: product, vol: vol, density: density,
        weight: toKG(vol, density),
        from: document.getElementById('ch-from').value,
        to: document.getElementById('ch-to').value,
        vehicle: document.getElementById('ch-vehicle').value,
        driver: document.getElementById('ch-driver').value,
        driverPh: document.getElementById('ch-driver-ph').value
    });
    if (!document.getElementById('ch-no').value.trim()) state.nextChNum++;
    saveState(); renderChallansTable(); toast('Created ' + no);
}

function renderSuppliersTable() {
    document.getElementById('suppliersTable').innerHTML = state.suppliers.map(function(s) {
        return '<tr><td><b>'+s.name+'</b></td><td>'+s.contact+'</td><td class="mono">'+s.phone+'</td><td>'+s.city+'</td><td><button class="btn btn-danger btn-sm" onclick="deleteItem(\'suppliers\','+s.id+')">&#x2715;</button></td></tr>';
    }).join('');
}
function addSupplier() {
    var n = document.getElementById('sup-name').value;
    if (!n) return toast('Enter company name', true);
    state.suppliers.push({
        id: state.nextSupId++, name: n,
        contact: document.getElementById('sup-contact').value,
        phone: document.getElementById('sup-phone').value,
        city: document.getElementById('sup-city').value
    });
    saveState(); renderSuppliersTable(); toast('Supplier added');
}

function renderReports() {
    var sales = 0, buys = 0;
    for (var i = 0; i < state.trades.length; i++) {
        var t = state.trades[i];
        if (t.type === 'Sell') sales += t.vol * t.price;
        else buys += t.vol * t.price;
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
    for (var i = 0; i < state.trades.length; i++) {
        var t = state.trades[i];
        if (t.type === 'Sell') cust[t.party] = (cust[t.party]||0) + (t.vol * t.price);
    }
    var top = Object.keys(cust).map(function(k){return [k, cust[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0, 5);
    document.getElementById('topCustomers').innerHTML = top.map(function(c) {
        return '<div class="stat-row"><span>'+c[0]+'</span><span class="stat-val">'+fmt(c[1])+'</span></div>';
    }).join('') || '<div class="empty">No sales data yet</div>';
}

/* ═══════ DELETE ACTIONS ═══════ */
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

function deleteItem(arr, id) {
    customConfirm('Remove this item?').then(function(ok) {
        if (!ok) return;
        state[arr] = state[arr].filter(function(x){ return x.id !== id; });
        saveState();
        if (arr === 'inventory') { renderInventoryTable(); renderDashboardKpis(); renderInvLevels(); }
        if (arr === 'trades') { renderTradesTable(); renderRecentTrades(); renderDashboardKpis(); }
        if (arr === 'suppliers') renderSuppliersTable();
        toast('Removed');
    });
}
function deleteOrder(id) {
    customConfirm('Delete order ' + id + '?').then(function(ok) {
        if (!ok) return;
        state.orders = state.orders.filter(function(o){ return o.id !== id; });
        saveState(); renderOrdersTable(); renderActiveOrders(); toast('Order removed');
    });
}
function deleteChallan(id) {
    customConfirm('Delete challan ' + id + '?').then(function(ok) {
        if (!ok) return;
        state.challans = state.challans.filter(function(c){ return c.id !== id; });
        saveState(); renderChallansTable(); toast('Challan removed');
    });
}
function deleteProduct(n) {
    customConfirm('Delete product "' + n + '"?').then(function(ok) {
        if (!ok) return;
        state.products = state.products.filter(function(p){ return p !== n; });
        saveState(); populateSelects(); renderProductsList(); toast('Product removed');
    });
}
function addProductMaster() {
    var n = document.getElementById('pm-name').value.trim();
    if (!n) return toast('Enter product name', true);
    if (state.products.indexOf(n) >= 0) return toast('Product already exists', true);
    state.products.push(n);
    state.densities[n] = parseFloat(document.getElementById('pm-density').value) || 0.85;
    saveState(); populateSelects(); renderProductsList();
    document.getElementById('pm-name').value = '';
    document.getElementById('pm-density').value = '';
    toast('Added: ' + n);
}

/* ═══════ TOAST ═══════ */
var _toastTimer = null;
function toast(msg, isErr) {
    var el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (isErr ? ' err' : '');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function(){ el.classList.remove('show'); }, 4000);
}

/* ═══════ PAGE SWITCH ═══════ */
function switchPage(name) {
    document.querySelectorAll('.page').forEach(function(p){ p.classList.remove('active'); });
    document.querySelectorAll('.nav-tab').forEach(function(t){ t.classList.remove('active'); });
    if (event && event.target) event.target.classList.add('active');
    document.getElementById('page-' + name).classList.add('active');
    if (name === 'reports') renderReports();
}

/* ═══════ TICKER ═══════ */
function renderTicker() {
    var prices = {'Crude Oil':6250,'Diesel':92.5,'Petrol':104.2,'Kerosene':78.3,'LPG':58.1};
    var changes = {'Crude Oil':'+1.2%','Diesel':'-0.3%','Petrol':'+0.5%','Kerosene':'-0.1%','LPG':'+0.8%'};
    document.getElementById('tickerEl').innerHTML = Object.keys(prices).map(function(p) {
        var ch = changes[p];
        var cls = ch.indexOf('+') >= 0 ? 'up' : 'down';
        return '<div class="ticker-item"><div class="ticker-name">'+p+'</div><div class="ticker-price">'+(p==='Crude Oil'?'$'+fmtN(prices[p]):fmt(prices[p]))+'</div><div class="ticker-chg '+cls+'">'+ch+'</div></div>';
    }).join('');
}

/* ═══════ INIT ═══════ */
document.getElementById('tr-date').value = today();
document.getElementById('ord-date').value = today();
document.getElementById('ch-date').value = today();
populateSelects();
renderProductsList();
renderTicker();
renderDashboardKpis();
renderInvLevels();
renderRecentTrades();
renderActiveOrders();
renderInventoryTable();
renderTradesTable();
renderOrdersTable();
renderChallansTable();
renderSuppliersTable();
toggleChallanFields();