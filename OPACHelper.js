const fetch = require('node-fetch')
const fs = require('fs')
const { tmpdir } = require('os')
//const { recognize } = require('tesseract.js')
const recognize = require('tesseractocr')
const qs = require('querystring')

class OPACHelper {
    constructor(options = {}) {
        this.options = options;
        this.needRelogin = false;
        this.captchaFile = `${tmpdir()}/captcha.gif`
    }
    // return verified cookie
    async login() {
        if (config.cookie != "" && this.needRelogin == false) {
            console.log(`[*] 检测到 Cookie: [${config.cookie}]`)
            console.log('[*] 正在使用此 Cookie 进行登录...')
            return Promise.resolve(config.cookie)
        }
        // get cookie for the next step
        const res = await fetch(`http://${config.url}/reader/login.php`)
        var cookie = res.headers.get('Set-Cookie')
        cookie = cookie.match(/(.*); path=\/; HttpOnly/)[1]
        console.log(`[1/3] 已拉取到新 Cookie: [${cookie}]`)
        const headers1 = {
            'Referer': `http://${config.url}/reader/login.php`,
            'Cookie': cookie
        }
        // download captcha gif
        await fetch(`http://${config.url}/reader/captcha.php`, { headers:headers1 })
            .then(res => {
                const dest = fs.createWriteStream(this.captchaFile)
                res.body.pipe(dest)
                return dest
            })

        let code = await recognize(this.captchaFile, {})
        code = code.trim()
        console.log(`[2/3] 验证码识别成功 ${code}`)
        
        const headers2 = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': `http://${config.url}/reader/redr_verify.php`,
            'Cookie': cookie
        }
        const param = `number=${config.user}&passwd=${config.passwd}&captcha=${code}&select=cert_no&returnUrl=`
        // console.log(param)
        const ok = await fetch(`http://${config.url}/reader/redr_verify.php`, {
            method: 'POST',
            headers: headers2,
            body: param
        })
        .then(res=>res.ok)
    
        if (ok) {
            console.log(`[3/3] Cookie 认证通过!`)
            return Promise.resolve(cookie)
        } else {
            throw new Error('verify-fail')
        }
    }
    async loadConfig() {
        global.config = require('./config.json')
        if (config.url == "" || config.user == "" || config.passwd == "")
            throw new Error('empty-config')
    }
    async saveCookie(cookie) {
        if (config.cookie == cookie) 
            return Promise.resolve();
        config.cookie = cookie
        fs.writeFile('./config.json', JSON.stringify(config, null, 2), err=>{
            if (err) throw err
            this.needRelogin = false;
            //console.log(`[*] Cookie [${cookie}] 已保存至配置文件.`)
            return Promise.resolve()
        })
    }
    /**
     * 获取读者当前借阅书籍的简略信息
     * @return {String}
     */
    async getLiteBooks() {
        // console.log("getLiteBook时的Cookie", config.cookie)
        if (config.cookie == "") {
            console.log('[!] Cookie不存在.')
            throw new Error('nonexist-cookie')
        }

        const body = await fetch(
            `http://${config.url}/reader/book_lst.php`,
            { headers: { 'Cookie': config.cookie } }
        ).then(res=>res.text())

        // test whether need relogin
        const needLogin = body.match(/<input.*value="登录">/)
        if(!needLogin) {
            const ifBorrow = body.match(/<img src=".*qrcode=(.*?)" border="0" \/>/)
            if(ifBorrow) {
                const base64 = ifBorrow[1]
                const res = Buffer.from(qs.unescape(base64), 'base64').toString()
                // console.log(res)
                return this.handleBooks2Json(res)
            }
            else {
                return {
                    success: 0,
                    msg: '您的该项记录为空！'
                }
            }
          
        } else {
            console.log('[!] Cookie过期啦, 正在尝试续Cookie...')
            this.needRelogin = true;
            throw new Error('cookie-expire')
        }
    }
    /**
     * 将获取到的借阅信息转JSON
     * @param {String} text
     * @return {JSON}
     */
    handleBooks2Json(text) {
        let json = []
        const pattern = /(.*)\u{20}{8}\r\n/ug
        //console.log(new Date().toLocaleDateString('zh'))
        text.match(pattern).forEach(val=>{
          let [name, time] = val.trim().split(/\u{20}/u)
          let mils = new Date(time).getTime() - new Date().getTime()
          let days = `${Math.floor(mils / (24*3600*1000))}d`
          //console.log(days)
          json.push({ name, time, days})
        })
        return JSON.stringify(json, null, 2)
    }
    /**
     * 测试获取个人主页
     * @return {void}
     */
    async getHomePage() {
        const headers = {
            'Cookie': config.cookie
        }
        return await fetch(`http://${URL}/reader/redr_info.php`, {headers})
        .then(res => {
            if (res.ok)
            return res.text()
        })
    }
    async run() {
        try {
            await this.loadConfig()
            const cookie = await this.login()
            await this.saveCookie(cookie)
            let res = await this.getLiteBooks()
            console.log(res)
        } catch (err) {
            if (err.message == 'empty-config') {
                console.log('[!] 请完整填写 config.json 文件');
            } else if (err.message == 'cookie-expire') {
                return this.run();
            } else {
                console.log(err)
            }
        }
    }
}

module.exports = OPACHelper;
