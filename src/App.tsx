import React, { useState, useEffect, useRef } from 'react';
import { Settings, Play, Square, MessageCircle, Edit2, Trash2, FileText, X, ArrowLeft, RefreshCw, AlertCircle, HelpCircle, Copy, Check, Bell, CheckCircle2, Circle } from 'lucide-react';

interface SheetData {
  timestamp: string;
  user_id: string;
  email: string;
  phone: string;
  otp: string;
  expires: string;
}

export default function App() {
  const [screen, setScreen] = useState<'main' | 'setup'>('main');
  const [sheetUrl, setSheetUrl] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [waTemplate, setWaTemplate] = useState('Hello, your OTP is {{otp}}');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [data, setData] = useState<SheetData[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notifications, setNotifications] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [browserNotifications, setBrowserNotifications] = useState(false);
  const [batterySaver, setBatterySaver] = useState(true);
  const [pollingInterval, setPollingInterval] = useState(10000);
  const [completedItems, setCompletedItems] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getRowId = (row: SheetData) => `${row.timestamp}-${row.phone}-${row.otp}`;

  const toggleCompleted = (rowId: string) => {
    setCompletedItems(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      localStorage.setItem('completedItems', JSON.stringify(Array.from(next)));
      return next;
    });
  };

  useEffect(() => {
    // Initialize audio
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    
    const url = localStorage.getItem('sheetUrl');
    const template = localStorage.getItem('waTemplate');
    const savedAutoStart = localStorage.getItem('autoStart') === 'true';
    const savedBatterySaver = localStorage.getItem('batterySaver') !== 'false';
    const savedPollingInterval = parseInt(localStorage.getItem('pollingInterval') || '10000', 10);
    const savedCompleted = localStorage.getItem('completedItems');
    
    if (savedCompleted) {
      try {
        setCompletedItems(new Set(JSON.parse(savedCompleted)));
      } catch (e) {}
    }

    if (Notification.permission === 'granted') {
      setBrowserNotifications(true);
    }
    if (url) {
      setSavedUrl(url);
      setSheetUrl(url);
      if (savedAutoStart) {
        setIsRunning(true);
      }
    }
    if (template) {
      setWaTemplate(template);
    }
    setAutoStart(savedAutoStart);
    setBatterySaver(savedBatterySaver);
    setPollingInterval(savedPollingInterval);
  }, []);

  const saveUrl = () => {
    localStorage.setItem('sheetUrl', sheetUrl);
    setSavedUrl(sheetUrl);
    setIsEditingUrl(false);
  };

  const deleteUrl = () => {
    localStorage.removeItem('sheetUrl');
    setSavedUrl('');
    setSheetUrl('');
    setIsEditingUrl(true);
  };

  const saveTemplate = () => {
    localStorage.setItem('waTemplate', waTemplate);
    setIsTemplateModalOpen(false);
  };

  const fetchData = async () => {
    if (!savedUrl) {
      setError('Please configure Google Sheet URL in Setup first.');
      setIsRunning(false);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(savedUrl);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      
      let parsedData: SheetData[] = [];
      if (Array.isArray(result)) {
        parsedData = result.map((row: any) => {
          if (Array.isArray(row)) {
            return {
              timestamp: row[0] || '',
              user_id: row[1] || '',
              email: row[2] || '',
              phone: row[3] || '',
              otp: row[4] || '',
              expires: row[5] || ''
            };
          }
          return row;
        });
      } else if (result.data && Array.isArray(result.data)) {
         parsedData = result.data;
      }
      
      setData((prevData) => {
        if (prevData.length > 0 && parsedData.length > prevData.length) {
          const newItems = parsedData.length - prevData.length;
          const latestRow = parsedData[parsedData.length - 1];
          triggerNotification('New OTP Received', `OTP ${latestRow.otp} for ${latestRow.phone}`, latestRow);
        }
        return parsedData;
      });
    } catch (err: any) {
      if (err.message === 'Failed to fetch') {
        setError('Connection failed. Ensure your Apps Script is deployed with "Execute as: Me" and "Who has access: Anyone".');
      } else {
        setError(err.message || 'Error fetching data. Ensure your Google Apps Script supports GET requests and returns JSON.');
      }
      setIsRunning(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isComponentMounted = true;

    const executePoll = async () => {
      if (!isRunning || !savedUrl) return;
      
      await fetchData();
      
      if (isComponentMounted && isRunning) {
        // Battery Saver: 60s in background, otherwise user's chosen interval
        const delay = (batterySaver && document.hidden) ? 60000 : pollingInterval;
        timeoutId = setTimeout(executePoll, delay);
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && isRunning) {
        // Woke up! Fetch immediately and reset interval
        clearTimeout(timeoutId);
        executePoll();
      }
    };

    if (isRunning) {
      executePoll();
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      isComponentMounted = false;
      clearTimeout(timeoutId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isRunning, savedUrl, batterySaver, pollingInterval]);

  const addNotification = (msg: string) => {
    setNotifications(prev => [...prev, msg]);
    setTimeout(() => {
      setNotifications(prev => prev.slice(1));
    }, 3000);
  };

  const openWhatsApp = (row: SheetData) => {
    let message = waTemplate.replace(/{{otp}}/g, row.otp || '').replace(/{{phone}}/g, row.phone || '');
    const encodedMessage = encodeURIComponent(message);
    const cleanPhone = (row.phone || '').replace(/\D/g, '');
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
    window.open(waUrl, '_blank');
  };

  const triggerNotification = (title: string, body: string, row?: SheetData) => {
    addNotification(body);
    if (audioRef.current) {
      audioRef.current.play().catch(e => console.log('Audio play failed:', e));
    }
    if (browserNotifications && Notification.permission === 'granted') {
      const notification = new Notification(title, { 
        body,
        icon: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',
        badge: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',
        vibrate: [200, 100, 200]
      });
      
      if (row) {
        notification.onclick = function() {
          window.focus();
          openWhatsApp(row);
          this.close();
        };
      }
    }
  };

  const appsScriptCode = `function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    var timestamp = new Date();
    
    // Append row matching the exact order of data
    sheet.appendRow([
      timestamp, 
      data.user_id, 
      data.email, 
      data.phone, 
      data.otp, 
      data.expires
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({"status": "success"}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "message": error.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    // Get all data from the sheet
    var data = sheet.getDataRange().getDisplayValues();
    
    // Return the data as JSON
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({"status": "error", "message": error.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

  const copyCode = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {screen === 'setup' && (
              <button onClick={() => setScreen('main')} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-xl font-semibold text-slate-800">
              {screen === 'main' ? 'OTP Sender' : 'Setup'}
            </h1>
          </div>
          {screen === 'main' && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsTemplateModalOpen(true)}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                title="Message Template"
              >
                <FileText className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setScreen('setup')}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
                title="Setup"
              >
                <Settings className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto p-4">
        {/* Notifications */}
        <div className="fixed top-20 right-4 z-50 flex flex-col gap-2">
          {notifications.map((notif, idx) => (
            <div key={idx} className="bg-emerald-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-in slide-in-from-right">
              {notif}
            </div>
          ))}
        </div>

        {screen === 'main' ? (
          <div className="space-y-6">
            {/* Controls */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-slate-800">Service Status</h2>
                <p className="text-sm text-slate-500">
                  {isRunning ? 'Actively polling for new OTPs...' : 'Service is stopped.'}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsRunning(!isRunning)}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium transition-all ${
                    isRunning 
                      ? 'bg-rose-100 text-rose-700 hover:bg-rose-200' 
                      : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'
                  }`}
                >
                  {isRunning ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  {isRunning ? 'Stop' : 'Start'}
                </button>
                {!isRunning && (
                  <button 
                    onClick={fetchData}
                    disabled={isLoading}
                    className="p-2.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors disabled:opacity-50"
                    title="Refresh manually"
                  >
                    <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            </div>

            {error && (
              <div className="bg-rose-50 text-rose-700 p-4 rounded-xl flex items-start gap-3 border border-rose-100">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Data List */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider px-1">Recent OTPs</h3>
              {data.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 border-dashed">
                  <p className="text-slate-500">No data available. Start the service to fetch.</p>
                </div>
              ) : (
                [...data].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((row, idx) => {
                  const rowId = getRowId(row);
                  const isCompleted = completedItems.has(rowId);
                  return (
                    <div key={idx} className={`p-4 rounded-xl shadow-sm border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${isCompleted ? 'bg-slate-50 border-slate-200 opacity-75' : 'bg-white border-slate-100 hover:border-slate-200'}`}>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1">
                        <div>
                          <p className="text-xs text-slate-400 mb-1">Phone</p>
                          <p className={`text-sm font-medium ${isCompleted ? 'text-slate-500' : 'text-slate-800'}`}>{row.phone || '-'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400 mb-1">OTP</p>
                          <p className={`text-sm font-mono font-medium px-2 py-0.5 rounded inline-block ${isCompleted ? 'text-slate-500 bg-slate-100' : 'text-indigo-600 bg-indigo-50'}`}>{row.otp || '-'}</p>
                        </div>
                        <div className="col-span-2 sm:col-span-2">
                          <p className="text-xs text-slate-400 mb-1">Timestamp</p>
                          <p className="text-sm text-slate-600">{row.timestamp ? new Date(row.timestamp).toLocaleString() : '-'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => toggleCompleted(rowId)}
                          className={`p-2 rounded-lg transition-colors ${isCompleted ? 'text-emerald-600 bg-emerald-100 hover:bg-emerald-200' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                          title={isCompleted ? "Mark as pending" : "Mark as completed"}
                        >
                          {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                        </button>
                        <button
                          onClick={() => {
                            openWhatsApp(row);
                            if (!isCompleted) toggleCompleted(rowId);
                          }}
                          className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${isCompleted ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-[#25D366] hover:bg-[#1EBE5D] text-white'}`}
                        >
                          <MessageCircle className="w-4 h-4" />
                          <span>Send WA</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 max-w-xl mx-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-slate-800">Google Sheet Connection</h2>
              <button 
                onClick={() => setIsGuideModalOpen(true)}
                className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                <HelpCircle className="w-4 h-4" />
                Setup Guide
              </button>
            </div>
            
            {savedUrl && !isEditingUrl ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 break-all">
                    <p className="text-sm text-slate-600 font-mono">{savedUrl}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsEditingUrl(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                    >
                      <Edit2 className="w-4 h-4" /> Edit
                    </button>
                    <button
                      onClick={deleteUrl}
                      className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-medium transition-colors"
                    >
                      <Trash2 className="w-4 h-4" /> Delete
                    </button>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-6 space-y-4">
                  <h3 className="text-sm font-medium text-slate-800 uppercase tracking-wider">App Settings</h3>
                  
                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <h4 className="font-medium text-slate-800">Auto-start Service</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Automatically start polling when app loads</p>
                    </div>
                    <button 
                      onClick={() => {
                        const newVal = !autoStart;
                        setAutoStart(newVal);
                        localStorage.setItem('autoStart', String(newVal));
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none ${autoStart ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${autoStart ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <h4 className="font-medium text-slate-800">Browser Notifications</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Get alerts and sounds even in background</p>
                    </div>
                    <button 
                      onClick={async () => {
                        if (!browserNotifications) {
                          const perm = await Notification.requestPermission();
                          if (perm === 'granted') setBrowserNotifications(true);
                        } else {
                          setBrowserNotifications(false);
                        }
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none ${browserNotifications ? 'bg-indigo-600' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${browserNotifications ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <h4 className="font-medium text-slate-800">Battery Saver</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Reduce background checks to 1 min to save battery</p>
                    </div>
                    <button 
                      onClick={() => {
                        const newVal = !batterySaver;
                        setBatterySaver(newVal);
                        localStorage.setItem('batterySaver', String(newVal));
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative focus:outline-none ${batterySaver ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${batterySaver ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                      <h4 className="font-medium text-slate-800">Check Interval</h4>
                      <p className="text-xs text-slate-500 mt-0.5">How often to fetch new OTPs</p>
                    </div>
                    <select
                      value={pollingInterval}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setPollingInterval(val);
                        localStorage.setItem('pollingInterval', String(val));
                      }}
                      className="bg-white border border-slate-200 text-slate-700 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2 outline-none"
                    >
                      <option value={5000}>5 Seconds</option>
                      <option value={10000}>10 Seconds</option>
                      <option value={30000}>30 Seconds</option>
                      <option value={60000}>1 Minute</option>
                    </select>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-800">
                      <strong>Background Execution:</strong> Web browsers automatically pause inactive tabs to save battery. To ensure you receive OTPs reliably, keep this tab open. The "Battery Saver" mode helps minimize drain when you switch to other tabs.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Web App URL</label>
                  <input
                    type="url"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Deploy your Google Apps Script as a Web App and paste the URL here. It must support GET requests returning JSON data.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={saveUrl}
                    disabled={!sheetUrl.trim()}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                  >
                    Save Connection
                  </button>
                  {savedUrl && (
                    <button
                      onClick={() => {
                        setSheetUrl(savedUrl);
                        setIsEditingUrl(false);
                      }}
                      className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Template Modal */}
      {isTemplateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="text-lg font-medium text-slate-800">WhatsApp Template</h3>
              <button 
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Message Template</label>
                <textarea
                  value={waTemplate}
                  onChange={(e) => setWaTemplate(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors resize-none"
                  placeholder="Hello, your OTP is {{otp}}"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Available variables: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600">{`{{otp}}`}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-600">{`{{phone}}`}</code>
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTemplate}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                >
                  Save Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal */}
      {isGuideModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 shrink-0">
              <h3 className="text-lg font-medium text-slate-800">Google Apps Script Setup Guide</h3>
              <button 
                onClick={() => setIsGuideModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-6">
              <div className="space-y-2">
                <h4 className="font-medium text-slate-800">1. Update your Google Apps Script</h4>
                <p className="text-sm text-slate-600">
                  Replace your existing code with this combined code. It includes your original <code className="bg-slate-100 px-1 py-0.5 rounded">doPost</code> function for adding data, and a new <code className="bg-slate-100 px-1 py-0.5 rounded">doGet</code> function to allow this app to read the data.
                </p>
                <div className="relative mt-2">
                  <pre className="bg-slate-800 text-slate-50 p-4 rounded-xl text-sm overflow-x-auto font-mono">
                    {appsScriptCode}
                  </pre>
                  <button
                    onClick={copyCode}
                    className="absolute top-2 right-2 p-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-1.5 text-xs font-medium"
                  >
                    {copied ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy Code</>}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-slate-800">2. Deploy as Web App</h4>
                <ol className="list-decimal list-inside text-sm text-slate-600 space-y-1.5 ml-1">
                  <li>Click <strong>Deploy</strong> &gt; <strong>New deployment</strong> in the Apps Script editor.</li>
                  <li>Select type: <strong>Web app</strong>.</li>
                  <li>Set Description (e.g., "Version 2").</li>
                  <li>Execute as: <strong>Me</strong>.</li>
                  <li>Who has access: <strong>Anyone</strong>.</li>
                  <li>Click <strong>Deploy</strong>.</li>
                </ol>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium text-slate-800">3. Connect the App</h4>
                <p className="text-sm text-slate-600">
                  Copy the new <strong>Web app URL</strong> provided after deployment and paste it into the Setup screen of this app.
                </p>
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 shrink-0 flex justify-end">
              <button
                onClick={() => setIsGuideModalOpen(false)}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
