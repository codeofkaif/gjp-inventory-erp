import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { User, Session, UserRole } from "../types";
import { get, set } from "./storage";
import { USERS_KEY, SESSION_KEY } from "./initStore";
import LoginPage from "../pages/LoginPage";

interface AuthContextType {
  user: User | null;
  role: UserRole;
  login: (userId: string) => boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load session on mount
  useEffect(() => {
    const session = get<Session>(SESSION_KEY);
    if (session?.userId) {
      const users = get<User[]>(USERS_KEY) ?? [];
      const matched = users.find((u) => u.id === session.userId);
      if (matched) {
        setCurrentUser(matched);
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    }
    setIsLoading(false);
  }, []);

  function login(userId: string): boolean {
    const users = get<User[]>(USERS_KEY) ?? [];
    const matched = users.find((u) => u.id === userId);
    if (!matched) return false;

    set<Session>(SESSION_KEY, { userId });
    setCurrentUser(matched);
    return true;
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="text-sm font-medium">Loading session...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthContext.Provider
        value={{
          user: null,
          role: "staff",
          login,
          logout,
        }}
      >
        <LoginPage />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user: currentUser,
        role: currentUser.role,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: { id: "u-admin", name: "Admin", pin: "1234", role: "admin", createdAt: "" },
      role: "admin",
      login: () => true,
      logout: () => {},
    };
  }
  return ctx;
}
