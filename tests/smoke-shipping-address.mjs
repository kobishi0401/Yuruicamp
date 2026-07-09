/**
 * 配送地址功能 smoke test
 * Run: node tests/smoke-shipping-address.mjs [baseUrl]
 */
import puppeteer from 'puppeteer';

const baseUrl = process.argv[2] || 'http://127.0.0.1:5173';

const userFixture = {
  id: 'U001',
  name: 'Amy Chen',
  phone: '0912-345-678',
  email: 'amy@example.com',
  isLoggedIn: true,
  shippingAddress: {
    lastName: '王',
    firstName: '小明',
    postalCode: '701',
    city: '臺南市',
    district: '東區',
    township: '',
    addressLine1: '長榮路二段200號',
    addressLine2: '',
    email: 'amy@example.com',
    phone: '0912345678',
  },
};

async function run() {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(20000);

  await page.goto(`${baseUrl}/pages/member-center.html`, { waitUntil: 'networkidle2' });
  await page.evaluate((payload) => {
    localStorage.setItem('isLoggedIn', 'true');
    localStorage.setItem('currentUser', JSON.stringify(payload));
    localStorage.setItem('yuruiUser', JSON.stringify(payload));
  }, userFixture);

  await page.reload({ waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.includes('會員資料'));
  await page.evaluate(() => {
    const tab = document.querySelector('[data-tab="profile"]');
    if (tab) tab.click();
  });
  await page.waitForSelector('#memberPanelProfile:not([hidden])');

  const before = await page.$eval('#shippingAddressDisplay', (el) => el.innerText);
  if (!before.includes('王小明') || !before.includes('長榮路')) {
    throw new Error(`會員中心地址顯示異常: ${before}`);
  }
  if (before.includes('0912-345')) {
    throw new Error(`電話不應含橫線: ${before}`);
  }
  console.log('✓ 會員中心地址顯示正常');

  await page.evaluate(() => {
    const btn = document.getElementById('shippingAddressEditBtn');
    if (btn) btn.click();
  });
  await page.waitForSelector('#shippingAddressModal.isOpen');
  const modalText = await page.$eval('#shippingAddressModal', (el) => el.innerText);
  if (!modalText.includes('手機')) throw new Error('Modal 應顯示「手機」欄位標籤');
  if (modalText.includes('電話')) throw new Error('Modal 不應再顯示「電話」標籤');

  // 欄位級驗證：錯誤應顯示在欄位下方，而非頂端總結區
  await page.evaluate(() => {
    const phone = document.getElementById('shipPhone');
    if (phone) phone.value = '123';
  });
  await page.evaluate(() => {
    const btn = document.getElementById('saveShippingAddressBtn');
    if (btn) btn.click();
  });
  const invalidState = await page.evaluate(() => ({
    topErrors: Boolean(document.getElementById('shippingAddressFormErrors')),
    phoneInvalid: document.getElementById('shipPhone')?.classList.contains('isInvalid'),
    phoneError: document.getElementById('shipPhoneError')?.textContent || '',
    modalOpen: document.getElementById('shippingAddressModal')?.classList.contains('isOpen'),
  }));
  if (invalidState.topErrors) throw new Error('不應再有頂端錯誤總結區塊');
  if (!invalidState.phoneInvalid) throw new Error('手機欄位應標記 isInvalid');
  if (!invalidState.phoneError.includes('09')) throw new Error(`手機欄位錯誤訊息異常: ${invalidState.phoneError}`);
  if (!invalidState.modalOpen) throw new Error('驗證失敗時 Modal 應保持開啟');
  console.log('✓ 配送地址欄位級錯誤提示正常');

  await page.evaluate(() => {
    const phone = document.getElementById('shipPhone');
    if (phone) phone.value = '0912345678';
  });
  await page.evaluate(() => {
    const input = document.getElementById('shipAddressLine1');
    if (input) input.value = input.value + '（測試）';
  });
  await page.evaluate(() => {
    const btn = document.getElementById('saveShippingAddressBtn');
    if (btn) btn.click();
  });

  const saveState = await page.evaluate(async () => {
    const sa = window.YuruiShippingAddress;
    const ui = window.YuruiShippingAddressUI;
    if (!sa || !ui) return { error: 'module missing' };
    const addr = ui.readForm();
    const validation = sa.validate(addr);
    return {
      validation,
      addr,
      hasApi: Boolean(window.API?.customers?.update),
      userId: window.AppState?.currentUser?.id || null,
      modalOpen: document.getElementById('shippingAddressModal')?.classList.contains('isOpen'),
    };
  });
  if (!saveState.validation?.ok) {
    throw new Error(`驗證失敗: ${JSON.stringify(saveState)}`);
  }

  await page.waitForFunction(
    () => !document.getElementById('shippingAddressModal').classList.contains('isOpen'),
    { timeout: 5000 }
  ).catch(async () => {
    throw new Error(`Modal 未關閉: ${JSON.stringify(saveState)}`);
  });

  const after = await page.$eval('#shippingAddressDisplay', (el) => el.innerText);
  if (!after.includes('（測試）')) {
    throw new Error(`會員中心地址儲存失敗: ${after}`);
  }
  console.log('✓ 會員中心 Modal 編輯儲存正常');

  const overlay = await page.evaluate(() => JSON.parse(localStorage.getItem('mockCustomerOverlay') || '{}'));
  if (!overlay.U001?.shippingAddress?.addressLine1?.includes('（測試）')) {
    throw new Error('mockCustomerOverlay 未更新 shippingAddress');
  }
  console.log('✓ mockCustomerOverlay 已同步');

  await page.goto(`${baseUrl}/booking/pages/member-center.html`, { waitUntil: 'networkidle2' });
  await page.waitForFunction(() => document.body.innerText.includes('會員資料'));
  await page.evaluate(() => {
    const tab = document.querySelector('[data-tab="profile"]');
    if (tab) tab.click();
  });
  await page.waitForSelector('#memberPanelProfile:not([hidden])');
  const bookingText = await page.$eval('#shippingAddressDisplay', (el) => el.innerText);
  if (!bookingText.includes('（測試）')) {
    throw new Error(`租借端會員中心未同步: ${bookingText}`);
  }
  console.log('✓ 租借端會員中心顯示與商城一致');

  await browser.close();
  console.log('Shipping address smoke test passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
