import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { FieldToken } from "../contracts/business";
type Insert = (token: FieldToken) => void;
const Context = createContext<{
  register: (handler: Insert) => () => void;
  insert: (token: FieldToken) => boolean;
}>({
  register:
    (_handler: Insert): (() => void) =>
    () => {},
  insert: (_token: FieldToken) => false,
});
export function FieldInsertionProvider({ children }: { children: ReactNode }) {
  const current = useRef<Insert | null>(null);
  const bridge = useMemo(
    () => ({
      register(handler: Insert) {
        current.current = handler;
        return () => {
          if (current.current === handler) current.current = null;
        };
      },
      insert(token: FieldToken) {
        if (!current.current) return false;
        current.current(token);
        return true;
      },
    }),
    [],
  );
  return <Context.Provider value={bridge}>{children}</Context.Provider>;
}
export const useFieldInsertion = () => useContext(Context);
