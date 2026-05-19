// Tally Prime Integration Module
// This file is loaded separately to maintain clean and modular code files.

function postXMLToTally(xmlString) {
    var tallyUrl = state.tallyUrl || 'http://localhost:9000';
    return fetch(tallyUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'text/xml',
            'Accept': 'text/xml'
        },
        body: xmlString
    })
    .then(response => {
        return response.text();
    });
}

function generateTallyVoucherXML(companyName, voucherType, dateStr, ledgerName, contraLedger, amount, narration) {
    const formattedDate = dateStr.replace(/-/g, '');
    const amountVal = parseFloat(amount) || 0;
    
    const isPayment = voucherType === 'Payment';
    const drLedger = isPayment ? ledgerName : contraLedger;
    const crLedger = isPayment ? contraLedger : ledgerName;
    const drAmount = -amountVal;
    const crAmount = amountVal;

    return `<?xml version="1.0" encoding="utf-8"?>
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>All Masters</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>${companyName}</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER VCHTYPE="${voucherType}" ACTION="Create" OBJTYPE="Voucher">
                        <DATE>${formattedDate}</DATE>
                        <VOUCHERTYPENAME>${voucherType}</VOUCHERTYPENAME>
                        <PARTYLEDGERNAME>${isPayment ? contraLedger : ledgerName}</PARTYLEDGERNAME>
                        <EFFECTIVEDATE>${formattedDate}</EFFECTIVEDATE>
                        <NARRATION>${escH(narration)}</NARRATION>
                        
                        <!-- DEBIT ENTRY -->
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>${drLedger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>${drAmount.toFixed(2)}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>
                        
                        <!-- CREDIT ENTRY -->
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>${crLedger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                            <AMOUNT>${crAmount.toFixed(2)}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>
                    </VOUCHER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>`;
}

function syncSupplierPaymentToTally(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const date = row.querySelector('input[type="date"]').value;
    const amount = parseFloat(row.querySelector('input[placeholder="Amt INR"]').value) || 0;
    const type = row.querySelector('select').value;
    const remarks = row.querySelector('input[placeholder="Ref/Remark"]').value;

    if (!amount) {
        return toast('Please enter a payment amount', true);
    }

    const partyVal = (document.getElementById('tr-party-select') && document.getElementById('tr-party-select').value) || (document.getElementById('tr-party') && document.getElementById('tr-party').value) || 'Supplier Ledger';
    const party = partyVal;
    const tradeId = editingTradeId || 'Draft';
    const narration = `Supplier Payment OUT - TR-${tradeId}. Remarks: ${remarks}`;

    const company = state.tallyCompany || 'Murji Oil';
    const contraLedger = type === 'Bank' ? (state.tallyBankLedger || 'Bank Account') : (state.tallyCashLedger || 'Cash');

    const xml = generateTallyVoucherXML(company, 'Payment', date, party, contraLedger, amount, narration);

    toast('Connecting to Tally Prime...');
    postXMLToTally(xml)
        .then(res => {
            if (res.indexOf('<CREATED>1</CREATED>') >= 0 || (res.indexOf('<ERRORS>') >= 0 && res.indexOf('<ERRORS>0</ERRORS>') >= 0)) {
                toast('Payment Sync Successful!');
            } else {
                const match = res.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/) || res.match(/<ERROR>([\s\S]*?)<\/ERROR>/);
                const errMsg = match ? match[1] : 'Check Tally log';
                toast('Tally Error: ' + errMsg, true);
            }
        })
        .catch(err => {
            console.error(err);
            toast('Failed to sync. Ensure Tally Prime is running with HTTP Server enabled.', true);
        });
}

function syncBuyerPaymentToTally(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;

    const date = row.querySelector('input[type="date"]').value;
    const amount = parseFloat(row.querySelector('input[placeholder="Amount"]').value) || 0;
    const type = row.querySelector('select').value;
    const remarks = row.querySelector('input[placeholder="Ref/Remark"]').value;

    if (!amount) {
        return toast('Please enter a receipt amount', true);
    }

    const partyVal = (document.getElementById('tr-party-select') && document.getElementById('tr-party-select').value) || (document.getElementById('tr-party') && document.getElementById('tr-party').value) || 'Buyer Ledger';
    const party = partyVal;
    const tradeId = editingTradeId || 'Draft';
    const narration = `Buyer Receipt IN - TR-${tradeId}. Remarks: ${remarks}`;

    const company = state.tallyCompany || 'Murji Oil';
    const contraLedger = type === 'Bank' ? (state.tallyBankLedger || 'Bank Account') : (state.tallyCashLedger || 'Cash');

    const xml = generateTallyVoucherXML(company, 'Receipt', date, party, contraLedger, amount, narration);

    toast('Connecting to Tally Prime...');
    postXMLToTally(xml)
        .then(res => {
            if (res.indexOf('<CREATED>1</CREATED>') >= 0 || (res.indexOf('<ERRORS>') >= 0 && res.indexOf('<ERRORS>0</ERRORS>') >= 0)) {
                toast('Receipt Sync Successful!');
            } else {
                const match = res.match(/<LINEERROR>([\s\S]*?)<\/LINEERROR>/) || res.match(/<ERROR>([\s\S]*?)<\/ERROR>/);
                const errMsg = match ? match[1] : 'Check Tally log';
                toast('Tally Error: ' + errMsg, true);
            }
        })
        .catch(err => {
            console.error(err);
            toast('Failed to sync. Ensure Tally Prime is running with HTTP Server enabled.', true);
        });
}

// Bind functions to window so they are globally accessible to HTML event triggers
window.postXMLToTally = postXMLToTally;
window.generateTallyVoucherXML = generateTallyVoucherXML;
window.syncSupplierPaymentToTally = syncSupplierPaymentToTally;
window.syncBuyerPaymentToTally = syncBuyerPaymentToTally;
