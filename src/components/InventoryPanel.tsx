import { useState, useEffect } from 'react';
import { Package, Lock, Key, FileText, ShieldCheck, Zap, AlertCircle } from 'lucide-react';
import { fetchWithAuth } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface InventoryItem {
  id: string;
  item_name: string;
  item_type: string;
  description: string;
  obtained_at: string;
  used: boolean;
}

const getItemIcon = (type: string) => {
  switch (type) {
    case 'key':
      return Key;
    case 'document':
      return FileText;
    case 'tool':
      return Zap;
    case 'access_card':
      return ShieldCheck;
    default:
      return Package;
  }
};

const getItemColor = (type: string) => {
  switch (type) {
    case 'key':
      return 'text-yellow-500 border-yellow-500/30 bg-yellow-500/10';
    case 'document':
      return 'text-blue-500 border-blue-500/30 bg-blue-500/10';
    case 'tool':
      return 'text-purple-500 border-purple-500/30 bg-purple-500/10';
    case 'access_card':
      return 'text-green-500 border-green-500/30 bg-green-500/10';
    default:
      return 'text-zinc-500 border-zinc-500/30 bg-zinc-500/10';
  }
};

export const InventoryPanel = () => {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchInventory();
    const interval = setInterval(fetchInventory, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchInventory = async () => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/gameplay/inventory`);

      if (!response.ok) throw new Error('Failed to fetch inventory');
      
      const data = await response.json();
      setInventory(data.items || []);
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetails = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsDetailsOpen(true);
  };

  if (isLoading) {
    return (
      <Card className="bg-black/40 border-toxic-green/20">
        <CardHeader>
          <CardTitle className="text-toxic-green flex items-center gap-2">
            <Package className="w-5 h-5" />
            Inventory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-zinc-400 py-4">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="bg-black/40 border-toxic-green/20">
        <CardHeader>
          <CardTitle className="text-toxic-green flex items-center gap-2">
            <Package className="w-5 h-5" />
            Inventory
            <Badge variant="outline" className="ml-auto text-toxic-green border-toxic-green/50">
              {inventory.length} items
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {inventory.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm text-zinc-400">No items collected yet</p>
              <p className="text-xs text-zinc-500 mt-1">Complete puzzles to collect items</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {inventory.map((item) => {
                const Icon = getItemIcon(item.item_type);
                const colorClass = getItemColor(item.item_type);

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'p-3 rounded-lg border cursor-pointer transition-all hover:scale-102',
                      colorClass,
                      item.used && 'opacity-50'
                    )}
                    onClick={() => handleViewDetails(item)}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold text-sm truncate">{item.item_name}</h4>
                          {item.used && (
                            <Badge variant="outline" className="text-xs">Used</Badge>
                          )}
                        </div>
                        <p className="text-xs opacity-80 line-clamp-2">{item.description}</p>
                        <p className="text-xs opacity-60 mt-1">
                          Obtained: {new Date(item.obtained_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Item Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="bg-black border-toxic-green">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-toxic-green flex items-center gap-2">
                  {(() => {
                    const Icon = getItemIcon(selectedItem.item_type);
                    return <Icon className="w-5 h-5" />;
                  })()}
                  {selectedItem.item_name}
                </DialogTitle>
                <DialogDescription>
                  <Badge 
                    variant="outline" 
                    className={cn("mt-2", getItemColor(selectedItem.item_type))}
                  >
                    {selectedItem.item_type.replace('_', ' ').toUpperCase()}
                  </Badge>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-300 mb-2">Description</h4>
                  <p className="text-sm text-zinc-400">{selectedItem.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 mb-1">Status</h4>
                    <Badge variant={selectedItem.used ? "outline" : "default"}>
                      {selectedItem.used ? 'Used' : 'Available'}
                    </Badge>
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-400 mb-1">Obtained</h4>
                    <p className="text-xs text-zinc-300">
                      {new Date(selectedItem.obtained_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {!selectedItem.used && (
                  <div className="p-3 bg-toxic-green/10 border border-toxic-green/30 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-toxic-green flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-zinc-300">
                        This item may be useful for upcoming puzzles. Keep it in your inventory.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

