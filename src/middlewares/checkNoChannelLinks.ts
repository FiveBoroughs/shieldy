import { ContextMessageUpdate } from 'telegraf'
import { report } from '../helpers/report'
// import { tall } from 'tall'
import { MessageEntity } from 'telegraf/typings/telegram-types'

// TODO - remove and use the Tall library once the PRed fix has been merged
import { parse } from 'url'
import { request as httpReq } from 'http'
import { request as httpsReq } from 'https'

export async function checkNoChannelLinks(
    ctx: ContextMessageUpdate,
    next: () => any
) {
    const message = ctx.editedMessage || ctx.message
    let markedForDeletion = false
    if (!message) {
        return next()
    }
    if (!ctx.dbchat.noChannelLinks) {
        return next()
    }
    if (ctx.from.id === parseInt(process.env.ADMIN)) {
        return next()
    }
    // For each of the links contained in the message
    let entities: MessageEntity[] = message.entities ? [].concat(message.entities) : []
    entities = message.caption_entities ? entities.concat(message.caption_entities) : entities
    for await (let entity of entities) {
        let url: string
        if (entity.type == 'url' && message.text)
            url = message.text.substring(entity.offset, entity.offset + entity.length)
        else if (entity.type == 'url' && message.caption)
            url = message.caption.substring(entity.offset, entity.offset + entity.length)
        else if (entity.type == 'text_link' && entity.url)
            url = entity.url

        // If the link is a telegram link, mark the message for deletion
        if (url) {
            try {
                url = url.includes('https://') ? url : url.includes('http://') ? url : 'http://' + url
                let unshortenedUrl = await tall(url, defaultOptions);
                if (unshortenedUrl && (unshortenedUrl.includes('http://t.me/') || unshortenedUrl.includes('https://t.me/'))) {
                    markedForDeletion = true
                    break
                }
            }
            catch (err) {
                await report(err)
            }
        }
    }
    //If one of the links in the message is a telegram link, delete the message
    if (markedForDeletion) {
        try {
            await ctx.deleteMessage()
        } catch (err) {
            await report(err)
        }
    } else {
        return next()
    }
}


// TODO - remove and use the Tall library once the PRed fix has been merged
const defaultOptions = {
    method: 'GET',
    maxRedirects: 3,
    headers: {}
}
const tall = (url, options) => {
    const opt = Object.assign({}, defaultOptions, options)
    return new Promise((resolve, reject) => {
        try {
            const { protocol, host, path } = parse(url)
            if (!protocol || !host || !path) {
                return reject(new Error(`Invalid url: ${url}`))
            }

            let [cleanHost, port] = host.split(':', 2)
            if (typeof port === 'undefined') {
                port = protocol === 'https:' ? '443' : '80'
            }

            const method = opt.method
            const request = protocol === 'https:' ? httpsReq : httpReq
            const headers = opt.headers
            return request({ method, protocol, host: cleanHost, port, path, headers }, response => {
                if (response.headers.location && opt.maxRedirects) {
                    opt.maxRedirects--
                    return resolve(
                        tall(response.headers.location.startsWith('http')
                            ? response.headers.location
                            : `${protocol}//${host}${response.headers.location}`, opt
                        )
                    )
                }

                resolve(url)
            }).on('error', function (err) {
                return reject(err)
            }).end()
        } catch (err) {
            return reject(err)
        }
    })
}