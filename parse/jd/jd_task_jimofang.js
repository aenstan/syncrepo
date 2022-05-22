const Template = require('../../template');

class Main extends Template {
    constructor() {
        super()
        this.title = "京东集魔方赢大奖"
        // this.cron = "22 0,22 * * *"
        this.task = 'local'
        this.thread = 3
        this.verify = 1
    }

    async prepare() {
        this.code = [
            `https://prodev.m.jd.com/mall/active/2fmVhvgmpWrmjC4rFmoU2ZfKgDKf/index.html`
        ]
        let custom = this.getValue('custom')
        let expand = this.getValue('expand')
        if (expand.length) {
            for (let i of expand) {
                this.code.unshift(i)
            }
        }
        if (custom.length) {
            this.code = []
            for (let i of custom) {
                this.code.push(i)
            }
        }
        let urls = []
        for (let i of this.code) {
            let url = i.substring(0, 4) == 'http' ? i : `https://prodev.m.jd.com/mall/active/${i}/index.html`
            if (!urls.includes(url)) {
                urls.push(url)
            }
        }
        if (urls.length) {
            for (let url of urls) {
                try {
                    let h = await this.curl({
                            url
                        }
                    )
                    let pageId = this.match(/"pageId"\s*:\s*"(\d+)"/, h)
                    let activityId = this.match(/"activityId"\s*:\s*"(\d+)"/, h)
                    let modules = this.matchAll(/module_(\d+)/g, h)
                    if (modules) {
                        let aa = await this.curl({
                                'url': `https://api.m.jd.com/client.action?functionId=queryPanamaFloor`,
                                'form': `screen=1170*2259&version=1.0.0&client=wh5&appid=babelh5&body={"activityId":"${activityId}","pageId":"${pageId}","floorList":[${modules.map(d => `{"alias":"${d}"}`).join(",")}],"imgDomain":"m11.360buyimg.com","siteClientVersion":"10.5.0"}&ext=%7B%22prstate%22%3A%220%22%7D`,
                            }
                        )
                        let data = this.dumps(aa)
                        let advertId = this.unique(this.matchAll(/"advertId":"(\d+)"/g, data))
                        let skuId = this.unique(this.matchAll(/"skuId":"(\d+)"/g, data))
                        advertId = [...advertId, ...skuId]
                        this.shareCode.push({
                            pageId, activityId, advertId, skuId
                        })
                    }
                    else {
                        let s = await this.curl({
                                'url': `https://api.m.jd.com/client.action?client=wh5&clientVersion=10.3.0&osVersion=15.1.1&networkType=wifi&ext=%7B%22prstate%22:%220%22%7D&functionId=qryCompositeMaterials&t=1640923295510&body={"geo":null,"mcChannel":0,"activityId":"${activityId}","pageId":"${pageId}","qryParam":"[{\\"type\\":\\"advertGroup\\",\\"id\\":\\"06167705\\",\\"mapTo\\":\\"advData\\",\\"next\\":[{\\"type\\":\\"productGroup\\",\\"mapKey\\":\\"comment[0]\\",\\"mapTo\\":\\"productGroup\\",\\"attributes\\":13},{\\"type\\":\\"productGroup\\",\\"mapKey\\":\\"comment[1]\\",\\"mapTo\\":\\"productGroup2\\",\\"attributes\\":13}]}]","applyKey":""}`,
                            }
                        )
                        let data = this.dumps(s)
                        let advertId = this.unique(this.matchAll(/(\d+)/g, this.matchAll(/"comments"\s*:\s*\[([^\]]+)\]/g, data).join(",")))
                        let skuId = this.unique(this.matchAll(/"skuId"\s*:\s*"(\d+)"/g, data))
                        advertId = [...advertId, ...skuId]
                        this.shareCode.push({
                            pageId, activityId, advertId, skuId
                        })
                    }
                } catch (e) {
                }
            }
        }
    }

    async main(p) {
        let cookie = p.cookie;
        let l = await this.curl({
                'url': `https://api.m.jd.com/client.action?uuid=&client=wh5&clientVersion=10.3.0&osVersion=15.1.1&networkType=wifi&appid=content_ecology&functionId=getInteractionInfo&t=1640607891598&body={"geo":{"lng":"","lat":""},"mcChannel":0,"sign":3}`,
                // 'form':``,
                cookie
            }
        )
        let interactionId = l.result.interactionId
        let taskPoolId = l.result.taskPoolInfo.taskPoolId
        for (let i of l.result.taskPoolInfo.taskList) {
            if (!i.taskStatus) {
                for (let j of Array(i.toastTime + 5)) {
                    let sku = this.random(p.inviter.skuId, 1)
                    let advertId = this.random(p.inviter.advertId, 1)
                    let s = await this.curl({
                            'url': `https://api.m.jd.com/client.action?uuid=&client=wh5&clientVersion=10.3.0&osVersion=15.1.1&networkType=wifi&&appid=content_ecology&functionId=executeNewInteractionTask&t=1640607957804&body={"geo":{"lng":"","lat":""},"mcChannel":0,"sign":3,"interactionId":${interactionId},"taskPoolId":${taskPoolId},"taskType":${i.taskId},"sku":"${sku}","advertId":"${advertId}"}`,
                            cookie
                        }
                    )
                    if (this.haskey(s, 'result.lotteryInfoList')) {
                        let gift = this.column(s.result.lotteryInfoList, 'quantity', 'name')
                        if (this.dumps(gift) != '{}') {
                            this.notices(`${this.dumps(gift)}`, p.user)
                            console.log(p.user, `获得奖励: ${this.dumps(gift)}`)
                        }
                    }
                    else {
                        console.log(p.user, `浏览: ${i.taskName} 但什么也没有`)
                    }
                }
            }
            else {
                console.log(p.user, `${i.taskName}任务已经完成了`)
            }
        }
        let lo = await this.curl({
                'url': `https://api.m.jd.com/client.action?uuid=&client=wh5&clientVersion=10.3.0&osVersion=11.4&networkType=wifi&ext={"prstate":"0"}&appid=content_ecology&functionId=getNewFinalLotteryInfo&t=1640748486454&body={"geo":null,"mcChannel":0,"sign":3,"interactionId":${interactionId}}`,
                // 'form':``,
                cookie
            }
        )
        if (this.haskey(lo, 'result.lotteryInfoList')) {
            console.log(lo.result.lotteryInfoList)
            let gift = this.column(lo.result.lotteryInfoList, 'quantity', 'name')
            if (this.dumps(gift) != '{}') {
                console.log(`${this.dumps(gift)}`, p.user)
                this.notices(`${this.dumps(gift)}`, p.user)
            }
        }
    }
}

module.exports = Main;