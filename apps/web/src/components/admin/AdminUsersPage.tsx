import { useEffect, useState } from "react";
import {
  createAdminUser,
  deleteAdminUser,
  getAdminUserProgress,
  getAdminUsers,
  setAdminUserProgress,
  updateAdminUser,
  type AdminUser,
  type AdminUserProgressRow,
} from "../../services/api";
import { useAuth } from "../../contexts/AuthContext";
import AdminNav from "./AdminNav";

function NewUserForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setError(null);
    try {
      await createAdminUser({ email, display_name: displayName, password, role });
      setEmail("");
      setDisplayName("");
      setPassword("");
      setRole("user");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    }
  };

  const field = "w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <label className="block text-xs text-slate-500">Email
        <input className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block text-xs text-slate-500">Display name
        <input className={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label className="block text-xs text-slate-500">Role
        <select className={field} value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </label>
      <label className="block text-xs text-slate-500">Password
        <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 characters" />
      </label>
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button className="primary-button text-sm" onClick={() => void create()}>Create</button>
        <button className="secondary-button text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function EditUserForm({ user, onSaved, onCancel }: { user: AdminUser; onSaved: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState(user.email);
  const [displayName, setDisplayName] = useState(user.display_name);
  const [role, setRole] = useState<"user" | "admin">(user.role);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    try {
      await updateAdminUser(user.id, {
        ...(email !== user.email ? { email } : {}),
        ...(displayName !== user.display_name ? { display_name: displayName } : {}),
        ...(role !== user.role ? { role } : {}),
        ...(password ? { password } : {}),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const field = "w-full rounded-md border border-slate-300 bg-transparent px-2 py-1.5 text-sm dark:border-slate-600";
  return (
    <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <label className="block text-xs text-slate-500">Email
        <input className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="block text-xs text-slate-500">Display name
        <input className={field} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
      </label>
      <label className="block text-xs text-slate-500">Role
        <select className={field} value={role} onChange={(e) => setRole(e.target.value as "user" | "admin")}>
          <option value="user">user</option>
          <option value="admin">admin</option>
        </select>
      </label>
      <label className="block text-xs text-slate-500">New password (blank = unchanged)
        <input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min 8 characters" />
      </label>
      {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button className="primary-button text-sm" onClick={() => void save()}>Save</button>
        <button className="secondary-button text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ProgressEditor({ userId }: { userId: string }) {
  const [rows, setRows] = useState<AdminUserProgressRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    getAdminUserProgress(userId)
      .then((response) => setRows(response.progress))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load progress"));
  };
  useEffect(load, [userId]);

  const setStatus = async (row: AdminUserProgressRow, status: AdminUserProgressRow["status"]) => {
    // Resetting to locked/unlocked also clears the best score.
    await setAdminUserProgress(userId, row.lesson_id, status, status === "completed" ? undefined : 0);
    load();
  };

  if (error) return <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>;
  if (!rows) return <p className="text-xs text-slate-500">Loading progress…</p>;
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-slate-500">
          <th className="py-1 pr-2 font-medium">#</th>
          <th className="py-1 pr-2 font-medium">Lesson</th>
          <th className="py-1 pr-2 font-medium">Best</th>
          <th className="py-1 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.lesson_id} className="border-t border-slate-100 dark:border-slate-800">
            <td className="py-1 pr-2 text-slate-400">{row.order}</td>
            <td className="py-1 pr-2">{row.title}</td>
            <td className="py-1 pr-2 tabular-nums">{Math.round(row.best_score)}</td>
            <td className="py-1">
              <select
                aria-label={`Status for ${row.title}`}
                className="rounded border border-slate-300 bg-transparent px-1 py-0.5 dark:border-slate-600"
                value={row.status}
                onChange={(e) => void setStatus(row, e.target.value as AdminUserProgressRow["status"])}
              >
                <option value="locked">locked</option>
                <option value="unlocked">unlocked</option>
                <option value="completed">completed</option>
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setError(null);
    getAdminUsers()
      .then((response) => setUsers(response.users))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load users"));
  };
  useEffect(load, []);

  const remove = async (user: AdminUser) => {
    if (!window.confirm(`Delete ${user.email} and all their data? This cannot be undone.`)) return;
    try {
      await deleteAdminUser(user.id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-4">
      <AdminNav />
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Users</h1>
        <button className="secondary-button text-sm" onClick={() => setCreating(!creating)}>
          {creating ? "Cancel" : "Add user"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
      {creating && <NewUserForm onCreated={() => { setCreating(false); load(); }} onCancel={() => setCreating(false)} />}
      <ul className="space-y-3">
        {users?.map((user) => (
          <li key={user.id} className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {user.display_name}
                  {user.role === "admin" && (
                    <span className="ml-2 rounded bg-brass-100 px-1.5 py-0.5 text-xs font-medium text-brass-700 dark:bg-brass-700/30 dark:text-brass-300">admin</span>
                  )}
                  {user.id === me?.id && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{user.email} · joined {new Date(user.created_at).toLocaleDateString()} · {user.completed_lessons}/{user.total_lessons} lessons</p>
              </div>
              <div className="ml-auto flex gap-2 text-sm">
                <button className="secondary-button text-xs" onClick={() => setExpanded(expanded === user.id ? null : user.id)}>
                  {expanded === user.id ? "Hide progress" : "Progress"}
                </button>
                <button className="secondary-button text-xs" onClick={() => setEditing(editing === user.id ? null : user.id)}>Edit</button>
                {user.id !== me?.id && (
                  <button className="rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30" onClick={() => void remove(user)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
            {editing === user.id && <EditUserForm user={user} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} />}
            {expanded === user.id && <ProgressEditor userId={user.id} />}
          </li>
        ))}
      </ul>
    </div>
  );
}
