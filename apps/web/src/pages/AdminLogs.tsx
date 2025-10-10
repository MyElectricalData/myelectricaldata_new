import { useState, useEffect } from 'react';
import { RefreshCw, AlertCircle, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
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
  all_modules?: string[];
}

const AdminLogs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [levelFilters, setLevelFilters] = useState<Set<string>>(new Set(['INFO']));
  const [moduleFilters, setModuleFilters] = useState<Set<string>>(new Set());
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [linesCount, setLinesCount] = useState<number>(100);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [autoRefresh, setAutoRefresh] = useState<number>(10000); // 10s by default

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
      // Fetch all logs without server-side filtering (we'll filter client-side)
      const response = await getAdminLogs(undefined, linesCount);
      setLogs(response.logs);
      // Update all modules list if provided by API
      if (response.all_modules && Array.isArray(response.all_modules)) {
        setAllModules(response.all_modules);

        // On initial load, select src and httpx modules by default
        if (isInitialLoad) {
          const defaultModules = response.all_modules.filter(m => {
            const category = m.split('.')[0];
            return category === 'src' || category === 'httpx';
          });
          setModuleFilters(new Set(defaultModules));
          setIsInitialLoad(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [linesCount]);

  // Auto-refresh effect
  useEffect(() => {
    if (autoRefresh > 0) {
      const interval = setInterval(() => {
        fetchLogs();
      }, autoRefresh);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, linesCount]);

  const toggleLevelFilter = (level: string) => {
    const newFilters = new Set(levelFilters);
    if (newFilters.has(level)) {
      newFilters.delete(level);
    } else {
      newFilters.add(level);
    }
    setLevelFilters(newFilters);
  };

  const toggleModuleFilter = (module: string) => {
    const newFilters = new Set(moduleFilters);
    if (newFilters.has(module)) {
      newFilters.delete(module);
    } else {
      newFilters.add(module);
    }
    setModuleFilters(newFilters);
  };

  const handleLinesChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setLinesCount(Number(event.target.value));
  };

  // Store all unique modules from API
  const [allModules, setAllModules] = useState<string[]>([]);

  // Filter out SQL modules (sqlalchemy.*) and group modules by category
  const filteredModules = allModules.filter(m =>
    !m.startsWith('sqlalchemy.engine') &&
    !m.startsWith('sqlalchemy.pool') &&
    !m.startsWith('sqlalchemy.orm')
  );

  // Group modules by first key (prefix before first dot)
  const modulesByCategory = filteredModules.reduce((acc, module) => {
    const category = module.split('.')[0];
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(module);
    return acc;
  }, {} as Record<string, string[]>);

  // Sort categories with src and httpx first
  const sortedCategories = Object.keys(modulesByCategory).sort((a, b) => {
    // src always first
    if (a === 'src') return -1;
    if (b === 'src') return 1;
    // httpx second
    if (a === 'httpx') return -1;
    if (b === 'httpx') return 1;
    // Others alphabetically
    return a.localeCompare(b);
  });

  const getLevelColor = (level: string): string => {
    switch (level) {
      case 'ERROR':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'WARNING':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
      case 'INFO':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'DEBUG':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  const filteredLogs = logs
    .filter(log => {
      const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase());
      // Si aucun filtre de niveau sélectionné, ne rien afficher
      const matchesLevel = levelFilters.size > 0 && levelFilters.has(log.level);
      // Si aucun filtre de module sélectionné, afficher tous les modules
      const matchesModule = moduleFilters.size === 0 || moduleFilters.has(log.module);
      return matchesSearch && matchesLevel && matchesModule;
    })
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
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="auto-refresh" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Auto-refresh
            </label>
            <select
              id="auto-refresh"
              value={autoRefresh}
              onChange={(e) => setAutoRefresh(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value={0}>Désactivé</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
              <option value={20000}>20s</option>
              <option value={30000}>30s</option>
              <option value={60000}>1min</option>
            </select>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Rafraîchir
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="space-y-4">
          {/* Ligne 1: Rechercher et Lignes */}
          <div className="flex gap-4">
            {/* Search */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600 flex-1">
              <label htmlFor="search" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">
                Rechercher
              </label>
              <input
                id="search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filtrer les messages..."
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
              />
            </div>

            {/* Lines count */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600 w-32">
              <label htmlFor="lines-count" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">
                Lignes
              </label>
              <select
                id="lines-count"
                value={linesCount}
                onChange={handleLinesChange}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
            </div>
          </div>

          {/* Ligne 2: Niveau et Modules */}
          <div className="flex gap-4">
            {/* Niveau filter */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Niveau
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLevelFilters(new Set(['INFO', 'WARNING', 'ERROR', 'DEBUG']))}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Tous
                  </button>
                  <button
                    onClick={() => setLevelFilters(new Set())}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Aucun
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {['INFO', 'WARNING', 'ERROR', 'DEBUG'].map(level => (
                  <label key={level} className="flex items-center gap-2 cursor-pointer hover:bg-white dark:hover:bg-gray-600 px-2 py-1 rounded transition-colors">
                    <input
                      type="checkbox"
                      checked={levelFilters.has(level)}
                      onChange={() => toggleLevelFilter(level)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                    />
                    <span className={`text-sm ${getLevelColor(level)} px-2 py-0.5 rounded font-medium`}>
                      {level}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Module filter - Grouped by category */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600 flex-1">
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Module ({moduleFilters.size}/{filteredModules.length})
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setModuleFilters(new Set(filteredModules))}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Tous
                  </button>
                  <button
                    onClick={() => setModuleFilters(new Set())}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Aucun
                  </button>
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto pr-1">
                {sortedCategories.map((category, idx) => (
                  <div key={category} className={`${idx > 0 ? 'mt-2 pt-2 border-t border-gray-300 dark:border-gray-600' : ''}`}>
                    <div className="flex items-center justify-between mb-1 px-1">
                      <span className="text-xs font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">
                        {category}
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            const categoryModules = modulesByCategory[category];
                            setModuleFilters(new Set(categoryModules));
                          }}
                          className="text-xs text-green-600 dark:text-green-400 hover:underline font-medium"
                        >
                          Seul
                        </button>
                        <button
                          onClick={() => {
                            const categoryModules = modulesByCategory[category];
                            const newFilters = new Set(moduleFilters);
                            const allSelected = categoryModules.every(m => newFilters.has(m));
                            if (allSelected) {
                              categoryModules.forEach(m => newFilters.delete(m));
                            } else {
                              categoryModules.forEach(m => newFilters.add(m));
                            }
                            setModuleFilters(newFilters);
                          }}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium"
                        >
                          {modulesByCategory[category].every(m => moduleFilters.has(m)) ? 'Aucun' : 'Tous'}
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-x-2 gap-y-0.5 ml-1">
                      {modulesByCategory[category].map(module => (
                        <label key={module} className="flex items-center gap-1.5 cursor-pointer hover:bg-white dark:hover:bg-gray-600 px-1.5 py-0.5 rounded transition-colors group">
                          <input
                            type="checkbox"
                            checked={moduleFilters.has(module)}
                            onChange={() => toggleModuleFilter(module)}
                            className="w-3.5 h-3.5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 flex-shrink-0"
                          />
                          <span className="text-xs text-gray-700 dark:text-gray-300 font-mono truncate group-hover:text-gray-900 dark:group-hover:text-white" title={module}>
                            {module.replace(`${category}.`, '')}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
                          }`}
                        >
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs h-12 align-middle">
                            {log.timestamp}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap h-12 align-middle">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getLevelColor(log.level)}`}>
                              {log.level}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-blue-400 whitespace-nowrap text-xs h-12 align-middle">
                            <button
                              onClick={() => {
                                // Toggle module filter
                                const newFilters = new Set(moduleFilters);
                                if (newFilters.has(log.module)) {
                                  newFilters.delete(log.module);
                                } else {
                                  newFilters.clear();
                                  newFilters.add(log.module);
                                }
                                setModuleFilters(newFilters);
                              }}
                              className="hover:underline cursor-pointer text-left"
                            >
                              {log.module || '-'}
                            </button>
                          </td>
                          <td className={`px-3 py-2 h-12 max-w-[800px] ${
                            log.level === 'ERROR' ? 'text-red-400' : 'text-gray-100'
                          }`}>
                            <div className="flex items-center justify-between gap-2 h-full">
                              <div className={`flex-1 min-w-0 ${isExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
                                {log.message}
                              </div>
                              {isMultiline && (
                                <button
                                  className="text-blue-400 hover:text-blue-300 flex-shrink-0 p-1 hover:bg-gray-700 rounded transition-all"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRow(index);
                                  }}
                                  title={isExpanded ? 'Réduire' : 'Développer'}
                                >
                                  <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                                </button>
                              )}
                            </div>
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
