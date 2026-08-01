import { describe, expect, it } from 'vitest'
import { CARDS, cardKind } from './cards'
import { HAND_SIZE, PLAYER_COUNT, createGame } from './setup'

describe('createGame — 재현성', () => {
  it('같은 시드는 같은 판을 만든다', () => {
    const a = createGame({ seed: 'nan2026' })
    const b = createGame({ seed: 'nan2026' })

    expect(b).toEqual(a)
  })

  it('다른 시드는 다른 판을 만든다', () => {
    const a = createGame({ seed: 'nan2026' })
    const b = createGame({ seed: 'nan2027' })

    expect(b).not.toEqual(a)
  })
})

describe('createGame — 카드 분배', () => {
  it('정답은 종류별로 정확히 1장씩이다', () => {
    const game = createGame({ seed: 'seal' })

    expect(cardKind(game.solution.suspect)).toBe('suspect')
    expect(cardKind(game.solution.weapon)).toBe('weapon')
    expect(cardKind(game.solution.place)).toBe('place')
  })

  it('15장이 정답 3장과 손패 12장으로 빠짐없이 나뉜다', () => {
    const game = createGame({ seed: 'deal' })

    const dealt = game.players.flatMap((p) => p.hand)
    const all = [
      game.solution.suspect,
      game.solution.weapon,
      game.solution.place,
      ...dealt,
    ]

    expect(dealt).toHaveLength(PLAYER_COUNT * HAND_SIZE)
    expect(new Set(all).size).toBe(CARDS.length) // 중복 없음
    expect([...all].sort()).toEqual(CARDS.map((c) => c.id).sort()) // 누락 없음
  })

  it('6명이 2장씩 갖는다', () => {
    const game = createGame({ seed: 'hands' })

    expect(game.players).toHaveLength(PLAYER_COUNT)
    for (const player of game.players) {
      expect(player.hand).toHaveLength(HAND_SIZE)
    }
  })

  it('아무도 정답 카드를 갖지 않는다', () => {
    const game = createGame({ seed: 'sealed' })
    const sealed = [game.solution.suspect, game.solution.weapon, game.solution.place]

    for (const player of game.players) {
      for (const card of player.hand) {
        expect(sealed).not.toContain(card)
      }
    }
  })
})

describe('createGame — 진영 배정', () => {
  it('범인은 정확히 1명이고, 그의 캐릭터가 정답의 범인이다', () => {
    const game = createGame({ seed: 'faction' })
    const culprits = game.players.filter((p) => p.faction === 'culprit')

    expect(culprits).toHaveLength(1)
    expect(culprits[0]?.characterId).toBe(game.solution.suspect)
  })

  it('6명이 서로 다른 캐릭터를 맡는다', () => {
    const game = createGame({ seed: 'cast' })
    const characters = game.players.map((p) => p.characterId)

    expect(new Set(characters).size).toBe(PLAYER_COUNT)
  })

  it('시드에 따라 플레이어의 진영이 바뀐다', () => {
    const factions = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(
      (seed) => createGame({ seed }).players[0]?.faction,
    )

    expect(new Set(factions).size).toBe(2) // 시민도 범인도 나온다
  })
})

describe('createGame — 초기 상태', () => {
  it('1라운드 제안 페이즈에서 시작한다', () => {
    const game = createGame({ seed: 'start' })

    expect(game.round).toBe(1)
    expect(game.phase).toBe('suggest')
    expect(game.turnIndex).toBe(0)
  })

  it('사람은 1명이고 humanIndex 자리에 앉는다', () => {
    const game = createGame({ seed: 'seat', humanIndex: 3 })
    const humans = game.players.filter((p) => p.isHuman)

    expect(humans).toHaveLength(1)
    expect(game.players[3]?.isHuman).toBe(true)
  })

  it('아직 공개된 카드가 없다', () => {
    const game = createGame({ seed: 'clean' })

    for (const player of game.players) {
      expect(player.revealed).toEqual([])
    }
  })
})
