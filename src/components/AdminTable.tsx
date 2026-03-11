import { ReactNode } from "react";
import { LoadingTable } from "./LoadingState";

type Column<T> = {
    header: string;
    render: (item: T) => ReactNode;
    className?: string;
};

type AdminTableProps<T> = {
    data: T[];
    columns: Column<T>[];
    keyExtractor: (item: T) => string;
    onEdit?: (item: T) => void;
    onClone?: (item: T) => void;
    onDelete?: (item: T) => void;
    emptyMessage?: string;
    loading?: boolean;
};

export function AdminTable<T>({
    data,
    columns,
    keyExtractor,
    onEdit,
    onClone,
    onDelete,
    emptyMessage = "No items found",
    loading = false,
}: AdminTableProps<T>) {
    return (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        <tr>
                            {columns.map((col, idx) => (
                                <th key={idx} className={`px-4 py-3 ${col.className || ""}`}>
                                    {col.header}
                                </th>
                            ))}
                            {(onEdit || onClone || onDelete) && <th className="px-4 py-3 text-right">Actions</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr>
                                <td
                                    colSpan={columns.length + (onEdit || onClone || onDelete ? 1 : 0)}
                                    className="px-4 py-4"
                                >
                                    <LoadingTable rows={5} columns={columns.length + (onEdit || onClone || onDelete ? 1 : 0)} />
                                </td>
                            </tr>
                        ) : data.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={columns.length + (onEdit || onClone || onDelete ? 1 : 0)}
                                    className="px-4 py-8 text-center text-slate-500"
                                >
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            data.map((item) => (
                                <tr key={keyExtractor(item)} className="hover:bg-slate-50/50">
                                    {columns.map((col, idx) => (
                                        <td key={idx} className={`px-4 py-3 ${col.className || ""}`}>
                                            {col.render(item)}
                                        </td>
                                    ))}
                                    {(onEdit || onClone || onDelete) && (
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex justify-end gap-2">
                                                {onEdit && (
                                                    <button
                                                        onClick={() => onEdit(item)}
                                                        className="rounded bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-100 uppercase tracking-tight"
                                                    >
                                                        Edit
                                                    </button>
                                                )}
                                                {onClone && (
                                                    <button
                                                        onClick={() => onClone(item)}
                                                        className="rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100 uppercase tracking-tight"
                                                    >
                                                        Clone
                                                    </button>
                                                )}
                                                {onDelete && (
                                                    <button
                                                        onClick={() => onDelete(item)}
                                                        className="rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                                                    >
                                                        Delete
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
