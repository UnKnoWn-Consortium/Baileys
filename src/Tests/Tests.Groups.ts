import { MessageType, GroupSettingChange, delay, ChatModification, whatsappID } from '../WAConnection/WAConnection'
import * as assert from 'assert'
import { WAConnectionTest, testJid, sendAndRetreiveMessage } from './Common'

WAConnectionTest('Groups', (conn) => {
    let gid: string
    it('should create a group', async () => {
        const response = await conn.groupCreate('Cool Test Group', [testJid])
        assert.ok (conn.chats.get(response.gid))
        
        const {chats} = await conn.loadChats(10, null)
        assert.strictEqual (chats[0].jid, response.gid) // first chat should be new group

        gid = response.gid

        console.log('created group: ' + JSON.stringify(response))
    })
    it('should retreive group invite code', async () => {
        const code = await conn.groupInviteCode(gid)
        assert.ok(code)
        assert.strictEqual(typeof code, 'string')
    })
    it('should retreive group metadata', async () => {
        const metadata = await conn.groupMetadata(gid)
        assert.strictEqual(metadata.id, gid)
        assert.strictEqual(metadata.participants.filter((obj) => obj.jid.split('@')[0] === testJid.split('@')[0]).length, 1)
        assert.ok(conn.chats.get(gid))
        assert.ok(conn.chats.get(gid).metadata)
    })
    it('should update the group description', async () => {
        const newDesc = 'Wow this was set from Baileys'

        const waitForEvent = new Promise (resolve => (
            conn.once ('group-update', ({jid, desc}) => {
                if (jid === gid && desc) {
                    assert.strictEqual(desc, newDesc)
                    assert.strictEqual(
                        conn.chats.get(jid).metadata.desc,
                        newDesc
                    )
                    resolve ()
                }
            })
        ))
        await conn.groupUpdateDescription (gid, newDesc)
        await waitForEvent

        const metadata = await conn.groupMetadata(gid)
        assert.strictEqual(metadata.desc, newDesc)
    })
    it('should send a message on the group', async () => {
        await sendAndRetreiveMessage(conn, 'Hello!', MessageType.text, {}, gid)
    })
    it('should quote a message on the group', async () => {
        const {messages} = await conn.loadMessages (gid, 100)
        const quotableMessage = messages.find (m => m.message)
        assert.ok (quotableMessage, 'need at least one message')
        
        const response = await conn.sendMessage(gid, 'hello', MessageType.extendedText, {quoted: quotableMessage})
        const loaded = await conn.loadMessages(gid, 10)
        const message = loaded.messages.find (m => m.key.id === response.key.id)?.message?.extendedTextMessage
        assert.ok(message)
        assert.strictEqual (message.contextInfo.stanzaId, quotableMessage.key.id)
    })
    it('should update the subject', async () => {
        const subject = 'Baileyz ' + Math.floor(Math.random()*5)
        const waitForEvent = new Promise (resolve => {
            conn.once ('chat-update', ({jid, name}) => {
                if (jid === gid) {
                    assert.strictEqual(name, subject)
                    assert.strictEqual(conn.chats.get(jid).name, subject)
                    resolve ()
                }
            })
        })
        await conn.groupUpdateSubject(gid, subject)
        await waitForEvent

        const metadata = await conn.groupMetadata(gid)
        assert.strictEqual(metadata.subject, subject)
    })

    it('should update the group settings', async () => {
        const waitForEvent = new Promise (resolve => {
            conn.once ('group-update', ({jid, announce}) => {
                if (jid === gid) {
                    assert.strictEqual (announce, 'true')
                    assert.strictEqual(conn.chats.get(gid).metadata.announce, announce)
                    resolve ()
                }
            })
        })
        await conn.groupSettingChange (gid, GroupSettingChange.messageSend, true)
        
        await waitForEvent
        conn.removeAllListeners ('group-update')

        await delay (2000)
        await conn.groupSettingChange (gid, GroupSettingChange.settingsChange, true)
    })

    it('should promote someone', async () => {
        const waitForEvent = new Promise (resolve => {
            conn.once ('group-participants-update', ({ jid, action, participants }) => {
                if (jid === gid) {
                    assert.strictEqual (action, 'promote')
                    console.log(participants)
                    console.log(conn.chats.get(jid).metadata)
                    assert.ok(
                        conn.chats.get(jid).metadata.participants.find(({ jid, isAdmin }) => (
                            whatsappID(jid) === whatsappID(participants[0]) && isAdmin
                        )),
                    )
                    resolve()
                }
                
            })
        })
        await conn.groupMakeAdmin(gid, [ testJid ])
        await waitForEvent
    })

    it('should remove someone from a group', async () => {
        const metadata = await conn.groupMetadata (gid)
        if (metadata.participants.find(({jid}) => whatsappID(jid) === testJid)) {
            const waitForEvent = new Promise (resolve => {
                conn.once ('group-participants-update', ({jid, participants, action}) => {
                    if (jid === gid) {
                        assert.strictEqual (participants[0], testJid)
                        assert.strictEqual (action, 'remove')
                        assert.deepStrictEqual(
                            conn.chats.get(jid).metadata.participants.find(p => whatsappID(p.jid) === whatsappID(participants[0])),
                            undefined
                        )
                        resolve ()
                    }
                })
            })

            await conn.groupRemove(gid, [testJid])
            await waitForEvent   
        } else console.log(`could not find testJid`)
    })

    it('should leave the group', async () => {
        const waitForEvent = new Promise (resolve => {
            conn.once ('chat-update', ({jid, read_only}) => {
                if (jid === gid) {
                    assert.strictEqual (read_only, 'true')
                    resolve ()
                }
            })
        })
        await conn.groupLeave(gid)
        await waitForEvent

        await conn.groupMetadataMinimal (gid)
    })
    it('should archive the group', async () => {
        const waitForEvent = new Promise (resolve => {
            conn.once ('chat-update', ({jid, archive}) => {
                if (jid === gid) {
                    assert.strictEqual (archive, 'true')
                    resolve ()
                }
            })
        })
        await conn.modifyChat(gid, ChatModification.archive)
        await waitForEvent
    })
    it('should delete the group', async () => {
        const waitForEvent = new Promise (resolve => {
            conn.once ('chat-update', (chat) => {
                if (chat.jid === gid) {
                    assert.strictEqual (chat['delete'], 'true')
                    resolve ()
                }
            })
        })
        await conn.modifyChat(gid, 'delete')
        await waitForEvent
    })
})