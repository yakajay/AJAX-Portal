import { MODULES, type Action, type Module } from '../../lib/permissions';

const LABELS: Record<Module, string> = {
  users: 'Users & accounts', leave: 'Leave', attendance: 'Attendance', hr: 'HR documents', payroll: 'Payroll',
  outsourcing: 'Outsourcing', support: 'Support tickets', org: 'Departments', announcements: 'Announcements',
  performance: 'Performance', expenses: 'Expenses', onboarding: 'Onboarding', recruitment: 'Recruitment'
};

/**
 * Admin permission picker. Global tokens (read / write / delete) apply to every area; per-area tokens
 * (e.g. payroll:write) grant more in one area only. Reading is implied by write or delete.
 */
const PermissionEditor = ({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) => {
  const has = (token: string) => value.includes(token);
  const toggle = (token: string, on: boolean) => onChange(on ? [...new Set([...value, token])] : value.filter((t) => t !== token));

  return (
    <div className="space-y-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <div>
        <p className="text-xs font-bold text-slate-500 mb-1">Access to every area</p>
        <div className="flex flex-wrap gap-4">
          {(['read', 'write', 'delete'] as Action[]).map((action) => (
            <label key={action} className="flex items-center text-sm text-slate-700 cursor-pointer capitalize">
              <input type="checkbox" className="mr-2" checked={has(action)} onChange={(e) => toggle(action, e.target.checked)} />
              {action}
            </label>
          ))}
        </div>
      </div>
      <details>
        <summary className="text-xs font-bold text-slate-500 cursor-pointer">Fine-tune by area</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-400"><th className="py-1">Area</th><th>Write</th><th>Delete</th></tr>
          </thead>
          <tbody>
            {MODULES.map((module) => (
              <tr key={module} className="border-t border-slate-200">
                <td className="py-1.5 text-slate-700">{LABELS[module]}</td>
                {(['write', 'delete'] as Action[]).map((action) => {
                  const inherited = has(action);
                  return (
                    <td key={action}>
                      <input
                        type="checkbox"
                        aria-label={`${LABELS[module]} ${action}`}
                        checked={inherited || has(`${module}:${action}`)}
                        disabled={inherited}
                        title={inherited ? `Granted for every area` : undefined}
                        onChange={(e) => toggle(`${module}:${action}`, e.target.checked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
};

export default PermissionEditor;
