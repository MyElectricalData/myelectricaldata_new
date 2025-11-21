import { useState, useEffect, useRef } from 'react';
import { RefreshCw, AlertCircle, ChevronUp, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { getAdminLogs } from '../api/admin';

type SortField = 'timestamp' | 'level' | 'module' | 'message';
type SortOrder = 'asc' | 'desc';

interface LogEntry {
  timestamp: string;
  level: string;
  logger: string;
  message: string;
  pathname: string;
  lineno: number;
  funcName: string;
  exception?: string;
}

interface GetLogsResponse {
  logs: LogEntry[];
}

const AdminLogs: React.FC = () => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newLogIds, setNewLogIds] = useState<Set<string>>(new Set());
  const [seenTimestamps, setSeenTimestamps] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load level filters from localStorage or use default
  const [levelFilters, setLevelFilters] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('adminLogs_levelFilters');
    return saved ? new Set(JSON.parse(saved)) : new Set(['INFO', 'WARNING', 'ERROR', 'DEBUG']);
  });

  // Load module filters from localStorage or use empty set
  const [moduleFilters, setModuleFilters] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('adminLogs_moduleFilters');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Load visible columns from localStorage or use default
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('adminLogs_visibleColumns');
    return saved ? new Set(JSON.parse(saved)) : new Set(['timestamp', 'level', 'module', 'message']);
  });

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [linesCount, setLinesCount] = useState<number>(100);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set()); // Use timestamp instead of index
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [autoRefresh, setAutoRefresh] = useState<number>(10000); // 10s by default
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Filters panel collapsed state
  const [isFiltersPanelCollapsed, setIsFiltersPanelCollapsed] = useState(() => {
    const saved = localStorage.getItem('adminLogs_filtersPanelCollapsed');
    return saved ? JSON.parse(saved) === true : false;
  });

  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('adminLogs_levelFilters', JSON.stringify(Array.from(levelFilters)));
  }, [levelFilters]);

  useEffect(() => {
    localStorage.setItem('adminLogs_moduleFilters', JSON.stringify(Array.from(moduleFilters)));
  }, [moduleFilters]);

  useEffect(() => {
    localStorage.setItem('adminLogs_visibleColumns', JSON.stringify(Array.from(visibleColumns)));
  }, [visibleColumns]);

  useEffect(() => {
    localStorage.setItem('adminLogs_filtersPanelCollapsed', JSON.stringify(isFiltersPanelCollapsed));
  }, [isFiltersPanelCollapsed]);

  // Keyboard shortcut for search (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K (Windows/Linux) or Cmd+K (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const toggleRow = (timestamp: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(timestamp)) {
      newExpanded.delete(timestamp);
    } else {
      newExpanded.add(timestamp);
    }
    setExpandedRows(newExpanded);
  };

  const copyToClipboard = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setToastMessage(`${fieldName} copié`);
    setTimeout(() => setToastMessage(null), 2000);
  };

  const fetchLogs = async () => {
    // Save scroll position and state before refresh
    const container = tableContainerRef.current;
    const scrollTop = container?.scrollTop || 0;

    // Consider "at top" if within 10px from top, otherwise preserve exact position
    const isAtTop = scrollTop < 10;

    // Find the first visible log timestamp to anchor scroll position
    let anchorTimestamp: string | null = null;
    let anchorOffsetTop = 0;

    if (!isAtTop && container) {
      const rows = container.querySelectorAll('tbody tr[data-timestamp]');
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as HTMLElement;
        const rect = row.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        if (rect.top >= containerRect.top) {
          anchorTimestamp = row.getAttribute('data-timestamp');
          anchorOffsetTop = rect.top - containerRect.top;
          break;
        }
      }
    }

    // Only show loading state on initial load, not on refresh
    if (isInitialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);
    try {
      // Fetch all logs without server-side filtering (we'll filter client-side)
      const response = await getAdminLogs(undefined, linesCount, 0) as GetLogsResponse;

      // Detect truly new logs by comparing with seenTimestamps
      const newLogs = response.logs.filter((log: LogEntry) =>
        !seenTimestamps.has(log.timestamp)
      );

      // Update seenTimestamps with all timestamps from response
      setSeenTimestamps(prevSeen => {
        const updated = new Set(prevSeen);
        response.logs.forEach((log: LogEntry) => updated.add(log.timestamp));
        return updated;
      });

      // Mark new logs for animation
      if (newLogs.length > 0 && !isInitialLoad) {
        const newIds = new Set(newLogs.map((log: LogEntry) => log.timestamp));
        setNewLogIds(newIds);

        // Only add new logs to the beginning, don't replace all logs
        // Keep the total count within linesCount limit
        setLogs(prevLogs => {
          const combined = [...newLogs, ...prevLogs];
          // Remove duplicates based on timestamp and limit to linesCount
          const uniqueLogs = combined.filter((log, index, self) =>
            index === self.findIndex(l => l.timestamp === log.timestamp)
          );
          return uniqueLogs.slice(0, linesCount);
        });

        // Remove animation after 5 seconds
        setTimeout(() => {
          setNewLogIds(new Set());
        }, 5000);
      } else {
        // Initial load or no new logs
        setLogs(response.logs);
      }

      // Extract unique modules from logs
      const uniqueModules = Array.from(new Set(response.logs.map((log: LogEntry) => log.logger)));

      // Only update modules list if new modules appeared
      setAllModules((prevModules: string[]) => {
        const prevModulesSet = new Set(prevModules);

        // Check if there are new modules
        const hasNewModules = uniqueModules.some(m => !prevModulesSet.has(m));

        return hasNewModules ? uniqueModules : prevModules;
      });

      // On initial load only, select src and httpx modules by default if no filters are saved
      if (isInitialLoad) {
        const hasSavedFilters = localStorage.getItem('adminLogs_moduleFilters');
        if (!hasSavedFilters) {
          const defaultModules = uniqueModules.filter(m => {
            const category = m.split('.')[0];
            return category === 'src' || category === 'httpx';
          });
          setModuleFilters(new Set(defaultModules));
        }
        setIsInitialLoad(false);
        setLoading(false); // Stop loading after initial load
      } else {
        setRefreshing(false);
        // Restore scroll position after refresh (with a small delay to ensure DOM is updated)
        setTimeout(() => {
          if (container) {
            if (isAtTop) {
              // If user was at the top, stay at top to see new logs
              container.scrollTop = 0;
            } else if (anchorTimestamp) {
              // Find the anchor element and restore position relative to it
              const anchorRow = container.querySelector(`tbody tr[data-timestamp="${anchorTimestamp}"]`);
              if (anchorRow) {
                const rect = anchorRow.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                const currentOffsetTop = rect.top - containerRect.top;
                const offsetDiff = currentOffsetTop - anchorOffsetTop;

                // Adjust scroll to maintain the same visual position
                container.scrollTop = container.scrollTop + offsetDiff;
              }
            } else {
              // Fallback: restore exact scroll position
              container.scrollTop = scrollTop;
            }
          }
        }, 0);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
      if (isInitialLoad) {
        setLoading(false);
      } else {
        setRefreshing(false);
      }
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
    // Toggle module in multi-select mode
    const newFilters = new Set(moduleFilters);
    if (newFilters.has(module)) {
      newFilters.delete(module);
    } else {
      newFilters.add(module);
    }
    setModuleFilters(newFilters);
  };

  const toggleColumn = (column: string) => {
    const newColumns = new Set(visibleColumns);
    if (newColumns.has(column)) {
      // Ne pas permettre de masquer toutes les colonnes
      if (newColumns.size > 1) {
        newColumns.delete(column);
      }
    } else {
      newColumns.add(column);
    }
    setVisibleColumns(newColumns);
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
      const matchesModule = moduleFilters.size === 0 || moduleFilters.has(log.logger);
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
          comparison = (a.logger || '').localeCompare(b.logger || '');
          break;
        case 'message':
          comparison = a.message.localeCompare(b.message);
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

  return (
    <div className="flex flex-col overflow-hidden pt-6 pb-6" style={{ height: 'calc(100vh - 64px)' }}>
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
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
            disabled={loading || refreshing}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Rafraîchir
          </button>
        </div>
      </div>

      <div className={`bg-white dark:bg-gray-800 rounded-lg shadow transition-all duration-300 mb-4 flex-shrink-0`}>
        <div className="p-4">
          <div className={`flex items-center justify-between ${isFiltersPanelCollapsed ? '' : 'mb-3'}`}>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Filtres</h2>
            <button
              onClick={() => setIsFiltersPanelCollapsed(!isFiltersPanelCollapsed)}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
              title={isFiltersPanelCollapsed ? 'Afficher les filtres' : 'Masquer les filtres'}
            >
              <ChevronDown className={`w-5 h-5 text-gray-600 dark:text-gray-400 transition-transform ${isFiltersPanelCollapsed ? '-rotate-90' : ''}`} />
            </button>
          </div>
          {!isFiltersPanelCollapsed && (
        <div className="space-y-4">
          {/* Ligne 1: Niveau et Modules */}
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

          {/* Ligne 2: Rechercher, Colonnes et Lignes */}
          <div className="flex gap-4">
            {/* Search */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600 flex-1">
              <label htmlFor="search" className="text-sm font-semibold text-gray-700 dark:text-gray-300 block mb-2">
                Rechercher
              </label>
              <div className="relative">
                <input
                  ref={searchInputRef}
                  id="search"
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Filtrer les messages..."
                  className="px-3 py-2 pr-16 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full"
                />
                <kbd className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-semibold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded shadow-sm">
                  Ctrl+K
                </kbd>
              </div>
            </div>

            {/* Columns selector */}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between gap-3 mb-2">
                <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  Colonnes
                </label>
                <button
                  onClick={() => setVisibleColumns(new Set(['timestamp', 'level', 'module', 'message']))}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Toutes
                </button>
              </div>
              <div className="flex gap-2">
                {[
                  { id: 'timestamp', label: 'Timestamp' },
                  { id: 'level', label: 'Niveau' },
                  { id: 'module', label: 'Module' },
                  { id: 'message', label: 'Message' },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    onClick={() => toggleColumn(id)}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      visibleColumns.has(id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
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
        </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4 flex-shrink-0">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow flex-1 flex flex-col p-4 min-h-0">
        <div className="pb-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {filteredLogs.length} log(s) trouvé(s)
          </p>
        </div>

          <div ref={tableContainerRef} className="overflow-auto pb-4 min-h-0" style={{ flex: 1 }}>
            {loading && logs.length === 0 ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
            ) : filteredLogs.length === 0 ? (
              <p className="text-gray-500 p-4 text-center">Aucun log trouvé</p>
            ) : (
                <table className="w-full font-mono text-xs border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-gray-800 text-gray-300 border-b border-gray-700 z-10">
                    <tr>
                      {visibleColumns.has('timestamp') && (
                        <th
                          className="px-2 py-1 text-left whitespace-nowrap w-40 cursor-pointer hover:bg-gray-700 select-none"
                          onClick={() => handleSort('timestamp')}
                        >
                          <div className="flex items-center gap-1">
                            Timestamp
                            {sortField === 'timestamp' && (
                              sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            )}
                          </div>
                        </th>
                      )}
                      {visibleColumns.has('level') && (
                        <th
                          className="px-2 py-1 text-left whitespace-nowrap w-20 cursor-pointer hover:bg-gray-700 select-none"
                          onClick={() => handleSort('level')}
                        >
                          <div className="flex items-center gap-1">
                            Niveau
                            {sortField === 'level' && (
                              sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            )}
                          </div>
                        </th>
                      )}
                      {visibleColumns.has('module') && (
                        <th
                          className="px-2 py-1 text-left whitespace-nowrap w-40 cursor-pointer hover:bg-gray-700 select-none"
                          onClick={() => handleSort('module')}
                        >
                          <div className="flex items-center gap-1">
                            Module
                            {sortField === 'module' && (
                              sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            )}
                          </div>
                        </th>
                      )}
                      {visibleColumns.has('message') && (
                        <th
                          className="px-2 py-1 text-left cursor-pointer hover:bg-gray-700 select-none"
                          onClick={() => handleSort('message')}
                        >
                          <div className="flex items-center gap-1">
                            Message
                            {sortField === 'message' && (
                              sortOrder === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                            )}
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-gray-900">
                    {filteredLogs.map((log) => {
                      const isExpanded = expandedRows.has(log.timestamp);
                      const isNewLog = newLogIds.has(log.timestamp);

                      // Get background color based on log level
                      const getRowBgColor = (level: string) => {
                        switch (level) {
                          case 'ERROR':
                          case 'CRITICAL':
                            return 'bg-red-900/10 dark:bg-red-900/20';
                          case 'WARNING':
                            return 'bg-yellow-900/10 dark:bg-yellow-900/20';
                          case 'DEBUG':
                            return 'bg-blue-900/10 dark:bg-blue-900/20';
                          default:
                            return '';
                        }
                      };

                      return (
                        <>
                          <tr
                            key={log.timestamp}
                            data-timestamp={log.timestamp}
                            onClick={() => toggleRow(log.timestamp)}
                            className={`border-b border-gray-800 hover:bg-gray-800/50 transition-all duration-500 cursor-pointer ${
                              getRowBgColor(log.level)
                            } ${
                              isNewLog ? 'animate-pulse-green' : ''
                            }`}
                          >
                            {visibleColumns.has('timestamp') && (
                              <td className="px-2 py-1 text-gray-500 whitespace-nowrap align-middle">
                                <div className="flex items-center gap-2">
                                  <ChevronRight className={`w-3 h-3 transition-transform flex-shrink-0 text-gray-400 ${isExpanded ? 'rotate-90' : ''}`} />
                                  {log.timestamp}
                                </div>
                              </td>
                            )}
                            {visibleColumns.has('level') && (
                              <td className="px-2 py-1 whitespace-nowrap align-middle text-center">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${getLevelColor(log.level)}`}>
                                  {log.level}
                                </span>
                              </td>
                            )}
                            {visibleColumns.has('module') && (
                              <td className="px-2 py-1 text-blue-400 whitespace-nowrap align-middle">
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // If the module is already the only one selected, deselect it
                                    if (moduleFilters.size === 1 && moduleFilters.has(log.logger)) {
                                      setModuleFilters(new Set());
                                    } else {
                                      // Otherwise, select only this module
                                      setModuleFilters(new Set([log.logger]));
                                    }
                                  }}
                                  className="hover:underline cursor-pointer"
                                >
                                  {log.logger || '-'}
                                </span>
                              </td>
                            )}
                            {visibleColumns.has('message') && (
                              <td className={`px-2 py-1 max-w-[800px] ${
                                log.level === 'ERROR' ? 'text-red-400' : 'text-gray-100'
                              }`}>
                                <div className={`${isExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
                                  {log.message}
                                </div>
                              </td>
                            )}
                          </tr>
                          {isExpanded && (
                            <tr className={`border-b border-gray-800 ${getRowBgColor(log.level)}`}>
                              <td colSpan={4} className="px-2 py-3">
                                <div className="text-xs space-y-3">
                                  {/* Fields grid */}
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="bg-gray-900 p-2 rounded group relative">
                                      <div className="flex items-start justify-between">
                                        <span className="text-gray-500 font-semibold">timestamp:</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(log.timestamp, 'Timestamp');
                                          }}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-400"
                                          title="Copier"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <div className="text-gray-300 mt-1 font-mono">{log.timestamp}</div>
                                    </div>
                                    <div className="bg-gray-900 p-2 rounded group relative">
                                      <div className="flex items-start justify-between">
                                        <span className="text-gray-500 font-semibold">level:</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(log.level, 'Level');
                                          }}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-400"
                                          title="Copier"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <div className="text-gray-300 mt-1 font-mono">{log.level}</div>
                                    </div>
                                    <div className="bg-gray-900 p-2 rounded group relative">
                                      <div className="flex items-start justify-between">
                                        <span className="text-gray-500 font-semibold">logger:</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(log.logger, 'Logger');
                                          }}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-400"
                                          title="Copier"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <div className="text-gray-300 mt-1 font-mono">{log.logger}</div>
                                    </div>
                                    <div className="bg-gray-900 p-2 rounded group relative">
                                      <div className="flex items-start justify-between">
                                        <span className="text-gray-500 font-semibold">function:</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(log.funcName, 'Function');
                                          }}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-400"
                                          title="Copier"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <div className="text-gray-300 mt-1 font-mono">{log.funcName}</div>
                                    </div>
                                    <div className="bg-gray-900 p-2 rounded col-span-2 group relative">
                                      <div className="flex items-start justify-between">
                                        <span className="text-gray-500 font-semibold">pathname:</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(`${log.pathname}:${log.lineno}`, 'Pathname');
                                          }}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-400"
                                          title="Copier"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <div className="text-gray-300 mt-1 font-mono">{log.pathname}:{log.lineno}</div>
                                    </div>
                                    <div className="bg-gray-900 p-2 rounded col-span-2 group relative">
                                      <div className="flex items-start justify-between">
                                        <span className="text-gray-500 font-semibold">message:</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(log.message, 'Message');
                                          }}
                                          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-400"
                                          title="Copier"
                                        >
                                          <Copy className="w-3 h-3" />
                                        </button>
                                      </div>
                                      <div className="text-gray-300 mt-1 font-mono whitespace-pre-wrap break-words">{log.message}</div>
                                    </div>
                                    {log.exception && (
                                      <div className="bg-gray-900 p-2 rounded col-span-2 group relative">
                                        <div className="flex items-start justify-between">
                                          <span className="text-gray-500 font-semibold">exception:</span>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              copyToClipboard(log.exception || '', 'Exception');
                                            }}
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-400"
                                            title="Copier"
                                          >
                                            <Copy className="w-3 h-3" />
                                          </button>
                                        </div>
                                        <div className="text-red-400 mt-1 font-mono whitespace-pre-wrap text-xs">{log.exception}</div>
                                      </div>
                                    )}
                                  </div>

                                  {/* JSON expandable section */}
                                  <details className="bg-gray-900 rounded">
                                    <summary className="cursor-pointer px-3 py-2 hover:bg-gray-800 rounded flex items-center justify-between">
                                      <span className="font-semibold text-gray-400">Voir le JSON complet</span>
                                      <button
                                        onClick={(e) => {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          copyToClipboard(JSON.stringify(log, null, 2), 'JSON');
                                        }}
                                        className="text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-gray-800 hover:bg-gray-700"
                                        title="Copier le JSON"
                                      >
                                        Copier
                                      </button>
                                    </summary>
                                    <pre className="p-3 overflow-x-auto text-gray-300 font-mono text-xs border-t border-gray-800">
                                      {JSON.stringify(log, null, 2)}
                                    </pre>
                                  </details>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

        {/* Toast notification */}
        {toastMessage && (
          <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Copy className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        )}
    </div>
  );
};

export default AdminLogs;
