import { MutableRefObject, useEffect, useReducer, useRef } from 'react';
import {
  Query,
  QuerySnapshot,
  QueryDocumentSnapshot,
  DocumentData,
  DocumentSnapshot,
  queryEqual,
  limit,
  onSnapshot,
  query,
  startAfter
} from 'firebase/firestore';

export interface PaginationOptions {
  limit?: number;
}

interface State<T extends DocumentData> {
  query: Query | undefined;
  queryRef: undefined | MutableRefObject<Query | undefined>;
  lastQuery: Query | undefined;
  firstDocRef: undefined | MutableRefObject<QueryDocumentSnapshot | undefined>;
  docs: QueryDocumentSnapshot[];
  lastDoc: QueryDocumentSnapshot | undefined;
  nextQuery: Query | undefined;
  items: (T & Pick<DocumentSnapshot, 'id'>)[];
  isLoading: boolean;
  isEnd: boolean;
  limit: number;
}

type ActionBase<K, V = void> = V extends void ? { type: K } : { type: K } & V;

type Action =
  | ActionBase<
      'SET-QUERY',
      {
        payload: {
          query: Query;
          queryRef: MutableRefObject<Query | undefined>;
          firstDocRef: MutableRefObject<QueryDocumentSnapshot | undefined>;
          limit: number;
        };
      }
    >
  | ActionBase<
      'LOAD',
      {
        payload: {
          value: QuerySnapshot;
          query: Query;
        };
      }
    >
  | ActionBase<'NEXT'>;

const defaultGuard = <S>(state: S, a: never) => state;

const getReducer = <T extends DocumentData>() => (state: State<T>, action: Action): State<T> => {
  switch (action.type) {
    case 'SET-QUERY': {
      const { query: queryObj, queryRef, firstDocRef, limit: limitNum } = action.payload;
      return {
        ...state,
        query: query(queryObj, limit(limitNum)),
        queryRef,
        firstDocRef,
        limit: limitNum,
        isLoading: true,
      };
    }

    case 'LOAD': {
      const { value } = action.payload;
      const docs = value.docs;

      const items = docs.map((doc) => ({
        ...(doc.data() as T),
        id: doc.id,
      }));



      const lastDoc = docs[docs.length - 1];
      const queryFromRef = state.queryRef ? state.queryRef.current : undefined;
      const nextQuery = queryFromRef && lastDoc ? query(queryFromRef, startAfter(lastDoc), limit(state.limit)) : state.nextQuery;

      return {
        ...state,
        docs: state.docs.concat(docs),
        lastQuery: items.length > 0 ? state.query : undefined,
        isLoading: false,
        lastDoc,
        nextQuery,
        items,
        isEnd: items.length < state.limit,
      };
    }

    case 'NEXT': {
      return {
        ...state,
        isLoading: true,
        query: state.nextQuery,
      };
    }

    default: {
      return defaultGuard(state, action);
    }
  }
};

const initialState = {
  query: undefined,
  queryRef: undefined,
  lastQuery: undefined,
  firstDocRef: undefined,
  docs: [],
  firstDoc: undefined,
  lastDoc: undefined,
  nextQuery: undefined,
  items: [],
  isLoading: true,
  isEnd: false,
  limit: 10,
};

const usePagination = <T extends DocumentData>(firestoreQuery: Query, options: PaginationOptions) => {
  const [state, dispatch] = useReducer(getReducer<T>(), initialState);
  const queryRef = useRef<Query | undefined>(undefined);
  const firstDocRef = useRef<QueryDocumentSnapshot | undefined>(undefined);

  const { limit: limitOpt = 10 } = options;

  useEffect(() => {
    if (firestoreQuery !== undefined) {
      if (queryRef?.current && queryEqual(firestoreQuery, queryRef.current) && limitOpt === state.limit) {
        return;
      }

      queryRef.current = firestoreQuery;
      firstDocRef.current = undefined;
      dispatch({
        type: 'SET-QUERY',
        payload: {
          query: firestoreQuery,
          queryRef,
          firstDocRef,
          limit: limitOpt
        },
      });
    }
  }, [firestoreQuery, limitOpt, state.limit]);

  useEffect(() => {
    if (state.query !== undefined) {
      const unsubscribe = onSnapshot(state.query, (snap) => {
        if (state.query) {
          dispatch({
            type: 'LOAD',
            payload: { value: snap, query: state.query },
          });
        }
      });

      return () => unsubscribe();
    }
  }, [state.query]);

  return {
    docs: state.docs,
    items: state.items,
    isLoading: state.isLoading,
    isEnd: state.isEnd,
    getNext: () => dispatch({ type: 'NEXT' }),
  };
};

export { usePagination };
