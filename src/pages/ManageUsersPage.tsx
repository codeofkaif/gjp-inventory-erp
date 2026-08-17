import { useState } from "react";
import type { User, UserRole } from "../types";
import { get, set } from "../lib/storage";
import { USERS_KEY } from "../lib/initStore";
import { useAuth } from "../lib/AuthContext";
import { logActivity } from "../lib/activityLog";
import DeleteDialog from "../components/DeleteDialog";

function loadUsers(): User[] {
  return (get<User[]>(USERS_KEY) ?? []).slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function ManageUsersPage() {
  const { user: currentUser, role } = useAuth();
  const [users, setUsers] = useState<User[]>(loadUsers);
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [userRole, setUserRole] = useState<UserRole>("staff");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  if (role !== "admin") {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-8 text-center max-w-lg mx-auto mt-12">
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="text-lg font-bold">Access Restricted</h3>
        <p className="text-sm mt-1 text-red-600">
          Only administrators have permission to manage users.
        </p>
      </div>
    );
  }

  function handleAddUser(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!name.trim()) {
      setError("Please enter a user name.");
      return;
    }
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError("PIN must be exactly 4 digits.");
      return;
    }

    const currentUsers = loadUsers();
    if (currentUsers.some((u) => u.name.toLowerCase() === name.trim().toLowerCase())) {
      setError("A user with this name already exists.");
      return;
    }

    const newUser: User = {
      id: `USR-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      pin,
      role: userRole,
      createdAt: new Date().toISOString(),
    };

    const nextUsers = [newUser, ...currentUsers];
    set<User[]>(USERS_KEY, nextUsers);
    setUsers(nextUsers);
    logActivity("create", "user", newUser.id);

    setName("");
    setPin("");
    setUserRole("staff");
    setIsAdding(false);
    setSuccess(`User "${newUser.name}" added successfully.`);
    setTimeout(() => setSuccess(""), 3000);
  }

  function handleDeleteUser() {
    if (!deleteTarget) return;

    const currentUsers = loadUsers();
    const adminCount = currentUsers.filter((u) => u.role === "admin").length;

    if (deleteTarget.role === "admin" && adminCount <= 1) {
      setError("Cannot delete the only remaining admin account.");
      setDeleteTarget(null);
      return;
    }

    const nextUsers = currentUsers.filter((u) => u.id !== deleteTarget.id);
    set<User[]>(USERS_KEY, nextUsers);
    setUsers(nextUsers);
    logActivity("delete", "user", deleteTarget.id);

    setDeleteTarget(null);
    setSuccess(`User "${deleteTarget.name}" deleted.`);
    setTimeout(() => setSuccess(""), 3000);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Manage Users</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Add staff members and manage roles and PIN access
          </p>
        </div>
        {!isAdding && (
          <button
            id="btn-add-user"
            onClick={() => {
              setName("");
              setPin("");
              setUserRole("staff");
              setError("");
              setIsAdding(true);
            }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
          >
            <span className="text-base leading-none">+</span> Add User
          </button>
        )}
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
          <span>✓</span> {success}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
          <span>⚠️</span> {error}
        </div>
      )}

      {/* Add user form modal/card */}
      {isAdding && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 animate-fadeIn">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Add New User</h3>
            <button
              onClick={() => setIsAdding(false)}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Cancel
            </button>
          </div>
          <form onSubmit={handleAddUser} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
              <input
                type="text"
                value={name}
                placeholder="e.g. John Doe"
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">4-Digit PIN *</label>
              <input
                type="password"
                maxLength={4}
                value={pin}
                placeholder="••••"
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Role *</label>
              <select
                value={userRole}
                onChange={(e) => setUserRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="staff">Staff (Limited Access)</option>
                <option value="admin">Admin (Full Access)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition"
              >
                Save User
              </button>
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Role</th>
              <th className="text-left px-4 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Created</th>
              <th className="text-right px-5 py-3.5 font-semibold text-slate-600 text-xs uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {[...users].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((u) => {
              const isMe = u.id === currentUser?.id;
              const isOnlyAdmin = u.role === "admin" && users.filter((x) => x.role === "admin").length <= 1;

              return (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs uppercase">
                        {u.name.slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 flex items-center gap-2">
                          {u.name}
                          {isMe && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                              You
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">{u.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-md uppercase tracking-wider ${
                        u.role === "admin"
                          ? "bg-purple-100 text-purple-700 border border-purple-200"
                          : "bg-slate-100 text-slate-700 border border-slate-200"
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs">
                    {fmtDate(u.createdAt)}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      disabled={isOnlyAdmin}
                      onClick={() => setDeleteTarget(u)}
                      title={isOnlyAdmin ? "Cannot delete the only admin" : "Remove user"}
                      className={`text-xs px-2.5 py-1 rounded transition ${
                        isOnlyAdmin
                          ? "text-slate-300 cursor-not-allowed"
                          : "text-red-600 hover:bg-red-50 hover:text-red-700"
                      }`}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {deleteTarget && (
        <DeleteDialog
          title={`Remove User "${deleteTarget.name}"?`}
          message={`Are you sure you want to delete ${deleteTarget.name}? This user will no longer be able to log in.`}
          onConfirm={handleDeleteUser}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
