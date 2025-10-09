import { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react';
import { getAdminLogs } from '../api/admin';

type SortField = 'timestamp' | 'level' | 'module' | 'message';
type SortOrder = 'asc' | 'desc';

interface LogEntry {
  timestamp: string;
  level: string;
  module: string;
  message: string;
}

interface LogsResponse {
  logs: LogEntry[];
  total: number;
  level_filter: string | null;
  lines_requested: number;
}

const AdminLogs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [linesCount, setLinesCount] = useState<number>(100);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle order if same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // New field, default to desc
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const toggleRow = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAdminLogs(levelFilter || undefined, linesCount);
      setLogs(response.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [levelFilter, linesCount]);

  const handleLevelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setLevelFilter(event.target.value);
  };

  const handleLinesChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setLinesCount(Number(event.target.value));
  };

  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'ERROR':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'WARNING':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'INFO':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const filteredLogs = logs
    .filter(log =>
      log.message.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'timestamp':
          comparison = a.timestamp.localeCompare(b.timestamp);
          break;
        case 'level':
          comparison = a.level.localeCompare(b.level);
          break;
        case 'module':
          comparison = (a.module || '').localeCompare(b.module || '');
          break;
        case 'message':
          comparison = a.message.localeCompare(b.message);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Logs d'application
        </h1>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Rafraîchir
        </button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="flex flex-col gap-1">
            <label htmlFor="level-filter" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Niveau
            </label>
            <select
              id="level-filter"
              value={levelFilter}
              onChange={handleLevelChange}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Tous</option>
              <option value="ERROR">Erreurs</option>
              <option value="WARNING">Avertissements</option>
              <option value="INFO">Informations</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="lines-count" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Lignes
            </label>
            <select
              id="lines-count"
              value={linesCount}
              onChange={handleLinesChange}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={1000}>1000</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label htmlFor="search" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Rechercher
            </label>
            <input
              id="search"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filtrer les messages..."
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
          <div className="p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              {filteredLogs.length} log(s) trouvé(s)
            </p>

            <div className="overflow-auto max-h-[70vh]">
              {filteredLogs.length === 0 ? (
                <p className="text-gray-500 p-4 text-center">Aucun log trouvé</p>
              ) : (
                <table className="w-full font-mono text-sm">
                  <thead className="sticky top-0 bg-gray-800 text-gray-300 border-b border-gray-700">
                    <tr>
                      <th
                        className="px-3 py-2 text-left whitespace-nowrap w-44 cursor-pointer hover:bg-gray-700 select-none"
                        onClick={() => handleSort('timestamp')}
                      >
                        <div className="flex items-center gap-1">
                          Timestamp
                          {sortField === 'timestamp' && (
                            sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left whitespace-nowrap w-24 cursor-pointer hover:bg-gray-700 select-none"
                        onClick={() => handleSort('level')}
                      >
                        <div className="flex items-center gap-1">
                          Niveau
                          {sortField === 'level' && (
                            sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left whitespace-nowrap w-48 cursor-pointer hover:bg-gray-700 select-none"
                        onClick={() => handleSort('module')}
                      >
                        <div className="flex items-center gap-1">
                          Module
                          {sortField === 'module' && (
                            sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </th>
                      <th
                        className="px-3 py-2 text-left cursor-pointer hover:bg-gray-700 select-none"
                        onClick={() => handleSort('message')}
                      >
                        <div className="flex items-center gap-1">
                          Message
                          {sortField === 'message' && (
                            sortOrder === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-gray-900">
                    {filteredLogs.map((log, index) => {
                      const isExpanded = expandedRows.has(index);
                      const isMultiline = log.message.includes('\n') || log.message.length > 100;

                      return (
                        <tr
                          key={index}
                          className={`border-b border-gray-800 hover:bg-gray-800/50 ${
                            log.level === 'ERROR' ? 'bg-red-900/10' : ''
                          } ${isMultiline ? 'cursor-pointer' : ''}`}
                          onClick={() => isMultiline && toggleRow(index)}
                        >
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap align-top text-xs">
                            {log.timestamp}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap align-top">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getLevelColor(log.level)}`}>
                              {log.level}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-blue-400 whitespace-nowrap align-top text-xs">
                            {log.module || '-'}
                          </td>
                          <td className={`px-3 py-2 ${
                            log.level === 'ERROR' ? 'text-red-400' : 'text-gray-100'
                          }`}>
                            <div className={isExpanded ? '' : 'truncate max-w-[800px]'}>
                              {log.message}
                            </div>
                            {isMultiline && (
                              <button
                                className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleRow(index);
                                }}
                              >
                                {isExpanded ? '▼ Réduire' : '▶ Développer'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminLogs;
