import { describe, expect, it } from 'vitest'
import { deriveFetchState } from '../app/utils/fetchState'

describe('deriveFetchState', () => {
  it('un échec est toujours error, jamais empty — même sans données', () => {
    expect(deriveFetchState({ loading: false, errored: true, itemCount: 0 })).toBe('error')
  })

  it('loading prime sur tout le reste', () => {
    expect(deriveFetchState({ loading: true, errored: true, itemCount: 5 })).toBe('loading')
  })

  it('distingue empty (aucune donnée) de empty-filtered (filtres actifs)', () => {
    expect(deriveFetchState({ loading: false, errored: false, itemCount: 0 })).toBe('empty')
    expect(deriveFetchState({ loading: false, errored: false, itemCount: 0, isFiltered: true })).toBe('empty-filtered')
  })

  it('des éléments présents donnent success', () => {
    expect(deriveFetchState({ loading: false, errored: false, itemCount: 3 })).toBe('success')
  })
})
