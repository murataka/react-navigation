import {
  findFocusedRoute,
  getActionFromState as getActionFromStateDefault,
  getPathFromState as getPathFromStateDefault,
  getStateFromPath as getStateFromPathDefault,
  NavigationContainerRef,
  NavigationState,
  ParamListBase,
} from '@react-navigation/core';
import isEqual from 'fast-deep-equal';
// import { nanoid } from 'nanoid/non-secure';
import * as React from 'react';

import ServerContext from './ServerContext';
import type { LinkingOptions } from './types';

type ResultState = ReturnType<typeof getStateFromPathDefault>;

// type HistoryRecord = {
//   // Unique identifier for this record to match it with window.history.state
//   id: string;
//   // Navigation state object for the history entry
//   state: NavigationState;
//   // Path of the history entry
//   path: string;
// };

const createMemoryHistory = () => {
  //let index = -1;
  //let items: HistoryRecord[] = [];
  let mappings: { [key: string]: any } = {};
  // Pending callbacks for `history.go(n)`
  // We might modify the callback stored if it was interrupted, so we have a ref to identify it
  const pending: { ref: unknown; cb: (interrupted?: boolean) => void }[] = [];

  // const interrupt = () => {
  //   // If another history operation was performed we need to interrupt existing ones
  //   // This makes sure that calls such as `history.replace` after `history.go` don't happen
  //   // Since otherwise it won't be correct if something else has changed
  //   return;
  //   // pending.forEach((it) => {
  //   //   const cb = it.cb;
  //   //   it.cb = () => cb(true);
  //   // });
  // };

  const history = {
    get(path: string) {
      return mappings[path];
    },
    listen: function (listener: () => void) {
      const onPopState = () => {
        if (pending.length) {
          // This was triggered by `history.go(n)`, we shouldn't call the listener
          // return;
        }

        listener();
      };
      console.log('addeventlistener');
      window.addEventListener('popstate', onPopState);

      return () => window.removeEventListener('popstate', onPopState);
    },
    replace: function (a: { [key: string]: any }) {
      if (!mappings[a.path]) {
        mappings[a.path] = a;
        window.history?.replaceState(a.state, window.document.title, a.path);
        console.log('replace', a, mappings);
      }
    },
    push: function (a: { path: string; state?: any }) {
      // if( mappings[a.path]) a= mappings[a.path];
      mappings[a.path] = a;
      window.history?.pushState(a.state, window.document.title, a.path);
      console.log('push', a, mappings);
    },
    backIndex: function (a: { state?: any; path: string }) {
      // window.history&&window.history.replaceState(a.state,window.document.title,a.path);
      console.log('backindex', a);
    },
  };

  return history;
};

/**
 * Find the matching navigation state that changed between 2 navigation states
 * e.g.: a -> b -> c -> d and a -> b -> c -> e -> f, if history in b changed, b is the matching state
 */
const findMatchingState = <T extends NavigationState>(
  a: T | undefined,
  b: T | undefined
): [T | undefined, T | undefined] => {
  if (a === undefined || b === undefined || a.key !== b.key) {
    return [undefined, undefined];
  }
  console.log('matchstate', a, b);
  // Tab and drawer will have `history` property, but stack will have history in `routes`
  const aHistoryLength = a.history ? a.history.length : a.routes.length;
  const bHistoryLength = b.history ? b.history.length : b.routes.length;

  const aRoute = a.routes[a.index];
  const bRoute = b.routes[b.index];

  const aChildState = aRoute.state as T | undefined;
  const bChildState = bRoute.state as T | undefined;

  // Stop here if this is the state object that changed:
  // - history length is different
  // - focused routes are different
  // - one of them doesn't have child state
  // - child state keys are different
  if (
    aHistoryLength !== bHistoryLength ||
    aRoute.key !== bRoute.key ||
    aChildState === undefined ||
    bChildState === undefined ||
    aChildState.key !== bChildState.key
  ) {
    return [a, b];
  }

  return findMatchingState(aChildState, bChildState);
};

// /**
//  * Run async function in series as it's called.
//  */
// const series = (cb: () => Promise<void>) => {
//   // Whether we're currently handling a callback
//   let handling = false;
//   let queue: (() => Promise<void>)[] = [];
//
//   const callback =  () => {
//     try {
//       if (handling) {
//         // If we're currently handling a previous event, wait before handling this one
//         // Add the callback to the beginning of the queue
//         queue.unshift(callback);
//         return;
//       }
//
//       handling = true;
//
//        cb();
//     } finally {
//       handling = false;
//
//       if (queue.length) {
//         // If we have queued items, handle the last one
//         const last = queue.pop();
//
//         last?.();
//       }
//     }
//   };
//
//   return callback;
// };

let linkingHandlers: Symbol[] = [];

type Options = LinkingOptions<ParamListBase> & {
  independent?: boolean;
};

export default function useLinkingAsync(
  ref: React.RefObject<NavigationContainerRef<ParamListBase>>,
  {
    independent,
    enabled = true,
    config,
    getStateFromPath = getStateFromPathDefault,
    getPathFromState = getPathFromStateDefault,
    getActionFromState = getActionFromStateDefault,
  }: Options
) {
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      return undefined;
    }

    if (independent) {
      return undefined;
    }

    if (enabled !== false && linkingHandlers.length) {
      console.error(
        [
          'Looks like you have configured linking in multiple places. This is likely an error since deep links should only be handled in one place to avoid conflicts. Make sure that:',
          "- You don't have multiple NavigationContainers in the app each with 'linking' enabled",
          '- Only a single instance of the root component is rendered',
        ]
          .join('\n')
          .trim()
      );
    }

    const handler = Symbol();

    if (enabled !== false) {
      linkingHandlers.push(handler);
    }

    return () => {
      const index = linkingHandlers.indexOf(handler);
      console.log('linkinghandlers');
      if (index > -1) {
        linkingHandlers.splice(index, 1);
      }
    };
  }, [enabled, independent]);

  const [history] = React.useState(createMemoryHistory);

  // We store these options in ref to avoid re-creating getInitialState and re-subscribing listeners
  // This lets user avoid wrapping the items in `React.useCallback` or `React.useMemo`
  // Not re-creating `getInitialState` is important coz it makes it easier for the user to use in an effect
  const enabledRef = React.useRef(enabled);
  const configRef = React.useRef(config);
  const getStateFromPathRef = React.useRef(getStateFromPath);
  const getPathFromStateRef = React.useRef(getPathFromState);
  const getActionFromStateRef = React.useRef(getActionFromState);

  React.useEffect(() => {
    enabledRef.current = enabled;
    configRef.current = config;
    getStateFromPathRef.current = getStateFromPath;
    getPathFromStateRef.current = getPathFromState;
    getActionFromStateRef.current = getActionFromState;
  });

  const server = React.useContext(ServerContext);

  const getInitialState = React.useCallback(() => {
    let value: ResultState | undefined;

    if (enabledRef.current) {
      const location =
        server?.location ??
        (typeof window !== 'undefined' ? window.location : undefined);

      const path = location ? location.pathname + location.search : undefined;

      if (path) {
        value = getStateFromPathRef.current(path, configRef.current);
      }
    }

    const thenable = {
      then(onfulfilled?: (state: ResultState | undefined) => void) {
        return Promise.resolve(onfulfilled ? onfulfilled(value) : value);
      },
      catch() {
        return thenable;
      },
    };

    return thenable as PromiseLike<ResultState | undefined>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // const previousIndexRef = React.useRef<number | undefined>(undefined);
  const previousStateRef = React.useRef<NavigationState | undefined>(undefined);
  const pendingPopStatePathRef = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    // previousIndexRef.current = history.index;

    return history.listen(() => {
      const navigation = ref.current;
      console.log('histlisten');
      if (!navigation || !enabled) {
        return;
      }

      const path = location.pathname + location.search;
      //  const index = history.index;

      // const previousIndex = previousIndexRef.current ?? 0;

      //  previousIndexRef.current = index;
      pendingPopStatePathRef.current = path;

      // When browser back/forward is clicked, we first need to check if state object for this index exists
      // If it does we'll reset to that state object
      // Otherwise, we'll handle it like a regular deep link

      const record = history.get(path);
      console.debug('historyget', path, record);
      if (record?.path === path && record?.state) {
        //  navigation.resetRoot(record.state);
        // return;
      }

      const state = getStateFromPathRef.current(path, configRef.current);

      if (!state) return;

      // We should only dispatch an action when going forward
      // Otherwise the action will likely add items to history, which would mess things up
      // if (state) {
      // Make sure that the routes in the state exist in the root navigator
      // Otherwise there's an error in the linking configuration
      const rootState = navigation.getRootState();

      if (state.routes.some((r) => !rootState?.routeNames.includes(r.name))) {
        console.warn(
          "The navigation state parsed from the URL contains routes not present in the root navigator. This usually means that the linking configuration doesn't match the navigation structure. See https://reactnavigation.org/docs/configuring-links for more details on how to specify a linking configuration."
        );
        return;
      }

      //     if (index > previousIndex) {
      const action = getActionFromStateRef.current(state, configRef.current);

      if (action !== undefined) {
        try {
          navigation.dispatch(action);
        } catch (e) {
          // Ignore any errors from deep linking.
          // This could happen in case of malformed links, navigation object not being initialized etc.
          console.warn(
            `An error occurred when trying to handle the link '${path}': ${
              typeof e === 'object' && e != null && 'message' in e
                ? // @ts-expect-error: we're already checking for this
                  e.message
                : e
            }`
          );
        }
        //       } else {
        // navigation.resetRoot(state);
      } else {
        //  navigation.resetRoot(state);
        // }
        // } else {
        // if current path didn't return any state, we should revert to initial state
        // navigation.resetRoot(state);
      }
    });
  }, [enabled, history, ref]);

  React.useEffect(() => {
    if (!enabled) {
      return;
    }

    const getPathForRoute = (
      route: ReturnType<typeof findFocusedRoute>,
      state: NavigationState
    ): string => {
      // If the `route` object contains a `path`, use that path as long as `route.name` and `params` still match
      // This makes sure that we preserve the original URL for wildcard routes
      if (route?.path) {
        const stateForPath = getStateFromPathRef.current(
          route.path,
          configRef.current
        );

        if (stateForPath) {
          const focusedRoute = findFocusedRoute(stateForPath);

          if (
            focusedRoute &&
            focusedRoute.name === route.name &&
            isEqual(focusedRoute.params, route.params)
          ) {
            return route.path;
          }
        }
      }

      return getPathFromStateRef.current(state, configRef.current);
    };

    if (ref.current) {
      // We need to record the current metadata on the first render if they aren't set
      // This will allow the initial state to be in the history entry
      const state = ref.current.getRootState();

      if (state) {
        const route = findFocusedRoute(state);
        const path = getPathForRoute(route, state);

        if (previousStateRef.current === undefined) {
          previousStateRef.current = state;
        }

        history.replace({ path, state });
      }
    }

    const onStateChange = () => {
      const navigation = ref.current;
      console.log('onstchg');
      if (!navigation || !enabled) {
        return;
      }

      const previousState = previousStateRef.current;
      const state = navigation.getRootState();

      // root state may not available, for example when root navigators switch inside the container
      if (!state) {
        return;
      }

      const pendingPath = pendingPopStatePathRef.current;
      const route = findFocusedRoute(state);
      const path = getPathForRoute(route, state);

      previousStateRef.current = state;
      pendingPopStatePathRef.current = undefined;

      // To detect the kind of state change, we need to:
      // - Find the common focused navigation state in previous and current state
      // - If only the route keys changed, compare history/routes.length to check if we go back/forward/replace
      // - If no common focused navigation state found, it's a replace
      const [previousFocusedState, focusedState] = findMatchingState(
        previousState,
        state
      );
      if (!previousFocusedState && !focusedState) {
        return;
      }
      if (location.pathname + location.search !== path) {
        const newLocal = pendingPath !== location.pathname;
        if (newLocal) {
          history.push({ path, state });
        }
      }

      //   if (
      //     previousFocusedState &&
      //     focusedState &&
      //     // We should only handle push/pop if path changed from what was in last `popstate`
      //     // Otherwise it's likely a change triggered by `popstate`
      //     path !== pendingPath
      //   ) {
      //     const historyDelta =
      //       (focusedState.history
      //         ? focusedState.history.length
      //         : focusedState.routes.length) -
      //       (previousFocusedState.history
      //         ? previousFocusedState.history.length
      //         : previousFocusedState.routes.length);

      //     if (historyDelta > 0) {
      //       // If history length is increased, we should pushState
      //       // Note that path might not actually change here, for example, drawer open should pushState
      //       history.push({ path, state });
      //     } else if (historyDelta < 0) {
      //       // If history length is decreased, i.e. entries were removed, we want to go back

      //       // const nextIndex = history.backIndex({ path });
      //       history.backIndex({ path });
      //       // const currentIndex = history.index;

      //     //   try {
      //     //     if (nextIndex !== -1 && nextIndex < currentIndex) {
      //     //       // An existing entry for this path exists and it's less than current index, go back to that
      //     //      //  history.go(nextIndex - currentIndex);
      //     //     } else {
      //     //       // We couldn't find an existing entry to go back to, so we'll go back by the delta
      //     //       // This won't be correct if multiple routes were pushed in one go before
      //     //       // Usually this shouldn't happen and this is a fallback for that
      //     //  //      history.go(historyDelta);
      //     //     }

      //     //     // Store the updated state as well as fix the path if incorrect
      //     //     history.replace({ path, state });
      //     //   } catch (e) {
      //     //     // The navigation was interrupted
      //     //   }
      //     } else {
      //       // If history length is unchanged, we want to replaceState
      //       console.log(1);
      //       history.push({ path, state });
      //     }
      //   } else {
      //     // If no common navigation state was found, assume it's a replace
      //     // This would happen if the user did a reset/conditionally changed navigators
      //        console.log(2);
      //     history.backIndex({ path, state });
      //   }
      // };
    };
    // // We debounce onStateChange coz we don't want multiple state changes to be handled at one time
    // // This could happen since `history.go(n)` is asynchronous
    // // If `pushState` or `replaceState` were called before `history.go(n)` completes, it'll mess stuff up

    return ref.current?.addListener('state', onStateChange);
  });
  return {
    getInitialState,
  };
}
