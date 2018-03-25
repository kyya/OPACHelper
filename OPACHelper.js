const config = require('./config.json')
const URL = config.url
const fetch = require('node-fetch')
const fs = require('fs')
const recognize = require('tesseractocr')
const qs = require('querystring')

async function login() {
  return await fetch(`http://${URL}/reader/login.php`)
    .then(res=>{
      const cookie = res.headers.get('Set-Cookie')
      return cookie.match(/(.*); path=\/; HttpOnly/)[1]
    })
    .then(cookie=>saveCookie(cookie))
}

function saveCookie(cookie) {
  config.cookie = cookie
  fs.writeFileSync('./config.json', JSON.stringify(config, null, 2))
}

async function getCode() {
  const headers = {
    'Referer': `http://${URL}/reader/login.php`,
    'Cookie': config.cookie
  }
  return await fetch(`http://${URL}/reader/captcha.php`, {headers})
    .then(res=>{
      const dest = fs.createWriteStream('./captcha.gif')
      res.body.pipe(dest)
      return dest
    })
}

async function doVerify() {
  let code = await recognize('captcha.gif', {})

  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer': `http://${URL}/reader/redr_verify.php`,
    'Cookie': config.cookie
  }
  const param = `number=${config.user}&passwd=${config.passwd}&captcha=${code.trim()}&select=cert_no&returnUrl=`
  // console.log(param)
  return await fetch(`http://${URL}/reader/redr_verify.php`, {
    method: 'POST',
    headers,
    body: param
  })
  .then(res=>{
    if (res.ok)
      console.log('[*] 通过自动认证!')
  })
}

/**
 * 测试获取个人主页
 * @return {void}
 */
async function getHomePage() {
  const headers = {
    'Cookie': config.cookie
  }
  return await fetch(`http://${URL}/reader/redr_info.php`, {headers})
    .then(res => {
      if (res.ok)
        return res.text()
    })
}

/**
 * 获取读者当前借阅书籍的简略信息
 * @return {String}
 */
async function getLiteBooks() {
  if (config.cookie == "") {
    console.log('[!] Cookie不存在，正在尝试自动登录...')
    await doFirstLogin()
  }

  const headers = {
    'Cookie': config.cookie
  }
  return await fetch(`http://${URL}/reader/book_lst.php`, {headers})
    .then(res=>res.text())
    .then(async body=>{
      const needLogin = body.match(/<input.*value="登录">/)
      if(!needLogin) {
        const base64 = body.match(/<img src=".*qrcode=(.*?)" border="0" \/>/)[1]
        const res = new Buffer(qs.unescape(base64), 'base64').toString()
        return res
      } else {
        console.log('[!] Cookie过期啦, 正在尝试续Cookie...')
        await doFirstLogin()
        return await getLiteBooks()
      }

    })
}

/**
 * 第一次登录或者Cookie过期时执行
 * @return {void}
 */
async function doFirstLogin() {
  await login()
  await getCode()
  await doVerify()
}

(async function () {
  //await getHomePage()
  if (config.url == "" || config.user == "" || config.passwd == "") {
    console.error("[!] 请完整填写config.json.")
    return 
  }
  let res = await getLiteBooks().catch(err=>console.error(err))
  console.log(res)
})()

