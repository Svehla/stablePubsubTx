import crypto from 'crypto'
import fs from 'fs'

// source of emojis:
// https://emojihub.org/
const emojiList = fs
  .readFileSync(`${process.cwd()}/src/utils/emojiList.txt`, 'utf-8')
  .split('\n')
  .filter(Boolean)

function simpleHash(data: any) {
  const hash = crypto.createHash('sha256').update(data).digest('hex')
  return hash
}

export const stringToEmoji = (inputString: string) => {
  let hash = parseInt(simpleHash(inputString), 16)
  const emojis = []
  const emojiCount = 3
  for (let i = 0; i < emojiCount; i++) {
    const index = hash % emojiList.length
    emojis.push(emojiList[index])
    hash = Math.floor(hash / emojiList.length)
  }
  return emojis.join('')
}
