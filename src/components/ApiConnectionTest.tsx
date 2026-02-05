import { useEffect, useState } from 'react';

interface ConnectionStatus {
  status: 'checking' | 'connected' | 'error';
  message: string;
  timestamp?: string;
}

const ApiConnectionTest = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    status: 'checking',
    message: 'Checking backend connection...'
  });

  useEffect(() => {
    const testConnection = async () => {
      try {
        const response = await fetch('/api/health');
        
        if (response.ok) {
          setConnectionStatus({
            status: 'connected',
            message: 'Successfully connected to backend API',
            timestamp: new Date().toLocaleString()
          });
        } else {
          setConnectionStatus({
            status: 'error',
            message: `Backend responded with status: ${response.status}`,
            timestamp: new Date().toLocaleString()
          });
        }
      } catch (error) {
        setConnectionStatus({
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown connection error',
          timestamp: new Date().toLocaleString()
        });
      }
    };

    testConnection();
  }, []);

  const statusStyles = {
    checking: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    connected: 'bg-green-100 text-green-800 border-green-300',
    error: 'bg-red-100 text-red-800 border-red-300'
  };

  return (
    <div className={`p-4 border rounded-lg ${statusStyles[connectionStatus.status]}`}>
      <h3 className="font-semibold mb-2">Backend Connection Status</h3>
      <p>{connectionStatus.message}</p>
      {connectionStatus.timestamp && (
        <p className="text-sm opacity-75 mt-1">Last checked: {connectionStatus.timestamp}</p>
      )}
      
      <div className="mt-3 space-y-1 text-sm">
        <p><strong>Frontend URL:</strong> {window.location.origin}</p>
        <p><strong>API Base:</strong> {import.meta.env.VITE_API_URL || '/api'}</p>
        <p><strong>Environment:</strong> {import.meta.env.VITE_ENV || 'development'}</p>
      </div>
    </div>
  );
};

export default ApiConnectionTest;