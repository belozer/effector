//@flow
import $$observable from 'symbol-observable'

import {step, readRef, writeRef, is} from '../stdlib'
import {createLink, createLinkNode, type Event} from '../event'
import {storeFabric} from './storeFabric'
import type {Store} from './index.h'
import type {Subscriber} from '../index.h'
import {watchUnit} from '../watcher'

export function reset(storeInstance: Store<any>, ...events: Array<Event<any>>) {
  for (const event of events)
    storeInstance.on(event, () => storeInstance.defaultState)
  return storeInstance
}

export function off(storeInstance: Store<any>, event: Event<any>) {
  const currentSubscription = storeInstance.subscribers.get(event)
  if (currentSubscription !== undefined) {
    currentSubscription()
    storeInstance.subscribers.delete(event)
  }
  return storeInstance
}

export function on(storeInstance: Store<any>, event: any, handler: Function) {
  storeInstance.off(event)
  storeInstance.subscribers.set(
    event,
    createLink(event, storeInstance, {
      scope: {
        handler,
        state: storeInstance.stateRef,
      },
      node: [
        step.compute({
          fn(newValue, {handler, state}) {
            const result = handler(readRef(state), newValue)
            if (result === undefined) return
            return writeRef(state, result)
          },
        }),
      ],
      meta: {op: 'on'},
    }),
  )
  return storeInstance
}
export function observable(storeInstance: Store<any>) {
  const result = {
    subscribe(observer: Subscriber<any>) {
      if (observer !== Object(observer))
        throw Error('expect observer to be an object') // or function
      return subscribe(storeInstance, state => {
        if (observer.next) {
          observer.next(state)
        }
      })
    },
  }
  //$off
  result[$$observable] = function() {
    return this
  }
  return result
}
export function watch(
  storeInstance: Store<any>,
  eventOrFn: Event<*> | Function,
  fn?: Function,
) {
  if (!fn || !is.unit(eventOrFn)) {
    if (typeof eventOrFn !== 'function')
      throw Error('watch requires function handler')
    return subscribe(storeInstance, eventOrFn)
  }
  if (typeof fn !== 'function')
    throw Error('second argument should be a function')
  return eventOrFn.watch(payload => fn(storeInstance.getState(), payload))
}
export function subscribe(storeInstance: Store<any>, handler: Function) {
  if (typeof handler !== 'function')
    throw Error('expect listener to be a function')
  handler(storeInstance.getState())
  return watchUnit(storeInstance, handler)
}

export function mapStore<A, B>(
  store: Store<A>,
  fn: (state: A, lastState?: B) => B,
  firstState?: B,
): Store<B> {
  let lastResult
  const storeState = store.getState()
  if (storeState !== undefined) {
    lastResult = fn(storeState, firstState)
  }

  const innerStore: Store<any> = storeFabric({
    config: {name: '' + store.shortName + ' → *'},
    currentState: lastResult,
    parent: store.domainName,
  })
  createLinkNode(store, innerStore, {
    scope: {
      handler: fn,
      state: innerStore.stateRef,
    },
    node: [
      step.compute({
        fn: (upd, {state, handler}) => handler(upd, readRef(state)),
      }),
      step.check.defined(),
      step.check.changed({
        store: innerStore.stateRef,
      }),
    ],
    meta: {op: 'map'},
  })
  return innerStore
}
