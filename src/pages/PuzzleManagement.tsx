import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Eye, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/BackButton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { fetchWithAuth } from '@/lib/api';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface Puzzle {
  id: string;
  level: number;
  puzzle_number: number;
  title: string;
  description: string;
  puzzle_type: string;
  puzzle_content: string;
  puzzle_file_url?: string;
  correct_answer: string;
  points: number;
  time_limit_minutes: number;
  is_active: boolean;
  hint_count: number;
  submission_count: number;
}

interface Hint {
  id?: string;
  hint_number: number;
  hint_text: string;
  time_penalty_seconds: number;
}

export default function PuzzleManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedLevel, setSelectedLevel] = useState<number | 'all'>('all');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [hints, setHints] = useState<Hint[]>([]);

  const [formData, setFormData] = useState({
    level: 1,
    puzzle_number: 1,
    title: '',
    description: '',
    puzzle_type: 'text',
    puzzle_content: '',
    puzzle_file_url: '',
    correct_answer: '',
    points: 100,
    time_limit_minutes: 4,
  });

  // Fetch puzzles
  const { data: puzzlesData, isLoading } = useQuery({
    queryKey: ['puzzles', selectedLevel],
    queryFn: async () => {
      const url = selectedLevel === 'all' 
        ? `${API_BASE}/puzzles`
        : `${API_BASE}/puzzles?level=${selectedLevel}`;
      
      const response = await fetchWithAuth(url);
      
      if (!response.ok) throw new Error('Failed to fetch puzzles');
      return response.json();
    },
  });

  // Create puzzle mutation
  const createPuzzle = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await fetchWithAuth(`${API_BASE}/puzzles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error('Failed to create puzzle');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['puzzles'] });
      setIsCreateOpen(false);
      resetForm();
      toast({
        title: 'Success',
        description: 'Puzzle created successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to create puzzle',
        variant: 'destructive',
      });
    },
  });

  // Update puzzle mutation
  const updatePuzzle = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof formData> }) => {
      const response = await fetchWithAuth(`${API_BASE}/puzzles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      
      if (!response.ok) throw new Error('Failed to update puzzle');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['puzzles'] });
      setIsEditOpen(false);
      toast({
        title: 'Success',
        description: 'Puzzle updated successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to update puzzle',
        variant: 'destructive',
      });
    },
  });

  // Delete puzzle mutation
  const deletePuzzle = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetchWithAuth(`${API_BASE}/puzzles/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error('Failed to delete puzzle');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['puzzles'] });
      setIsDeleteOpen(false);
      toast({
        title: 'Success',
        description: 'Puzzle deleted successfully',
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to delete puzzle',
        variant: 'destructive',
      });
    },
  });

  const resetForm = () => {
    setFormData({
      level: 1,
      puzzle_number: 1,
      title: '',
      description: '',
      puzzle_type: 'text',
      puzzle_content: '',
      puzzle_file_url: '',
      correct_answer: '',
      points: 100,
      time_limit_minutes: 4,
    });
    setHints([]);
  };

  const handleEdit = (puzzle: Puzzle) => {
    setCurrentPuzzle(puzzle);
    setFormData({
      level: puzzle.level,
      puzzle_number: puzzle.puzzle_number,
      title: puzzle.title,
      description: puzzle.description,
      puzzle_type: puzzle.puzzle_type,
      puzzle_content: puzzle.puzzle_content,
      puzzle_file_url: puzzle.puzzle_file_url || '',
      correct_answer: puzzle.correct_answer,
      points: puzzle.points,
      time_limit_minutes: puzzle.time_limit_minutes,
    });
    setIsEditOpen(true);
  };

  const handleDelete = (puzzle: Puzzle) => {
    setCurrentPuzzle(puzzle);
    setIsDeleteOpen(true);
  };

  const puzzles = puzzlesData?.puzzles || [];

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Back Button */}
      <BackButton label="Back to Admin" to="/admin" />
      
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-toxic-green">Puzzle Management</h1>
          <p className="text-zinc-400 mt-2">Create and manage game puzzles</p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-green-500 text-white hover:bg-green-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Puzzle
        </Button>
      </div>

      {/* Level Filter */}
      <div className="flex gap-2">
        <Button
          variant={selectedLevel === 'all' ? 'default' : 'outline'}
          onClick={() => setSelectedLevel('all')}
          className={selectedLevel === 'all' ? 'bg-green-500 text-white hover:bg-green-600' : 'border-zinc-600 text-zinc-300 hover:bg-zinc-800'}
        >
          All Levels
        </Button>
        <Button
          variant={selectedLevel === 1 ? 'default' : 'outline'}
          onClick={() => setSelectedLevel(1)}
          className={selectedLevel === 1 ? 'bg-green-500 text-white hover:bg-green-600' : 'border-zinc-600 text-zinc-300 hover:bg-zinc-800'}
        >
          Level 1
        </Button>
        <Button
          variant={selectedLevel === 2 ? 'default' : 'outline'}
          onClick={() => setSelectedLevel(2)}
          className={selectedLevel === 2 ? 'bg-green-500 text-white hover:bg-green-600' : 'border-zinc-600 text-zinc-300 hover:bg-zinc-800'}
        >
          Level 2
        </Button>
      </div>

      {/* Puzzles Table */}
      <div className="border border-toxic-green/20 rounded-lg overflow-hidden bg-black/40">
        <Table>
          <TableHeader>
            <TableRow className="border-toxic-green/20 hover:bg-toxic-green/5">
              <TableHead className="text-toxic-green">Level</TableHead>
              <TableHead className="text-toxic-green">#</TableHead>
              <TableHead className="text-toxic-green">Title</TableHead>
              <TableHead className="text-toxic-green">Type</TableHead>
              <TableHead className="text-toxic-green">Points</TableHead>
              <TableHead className="text-toxic-green">Time</TableHead>
              <TableHead className="text-toxic-green">Hints</TableHead>
              <TableHead className="text-toxic-green">Submissions</TableHead>
              <TableHead className="text-toxic-green">Status</TableHead>
              <TableHead className="text-toxic-green text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-zinc-400">
                  Loading puzzles...
                </TableCell>
              </TableRow>
            ) : puzzles.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-zinc-400">
                  No puzzles found. Create your first puzzle!
                </TableCell>
              </TableRow>
            ) : (
              puzzles.map((puzzle: Puzzle) => (
                <TableRow
                  key={puzzle.id}
                  className="border-toxic-green/10 hover:bg-toxic-green/5"
                >
                  <TableCell className="font-medium text-toxic-green">
                    Level {puzzle.level}
                  </TableCell>
                  <TableCell>{puzzle.puzzle_number}</TableCell>
                  <TableCell className="font-medium">{puzzle.title}</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 rounded bg-toxic-green/10 text-toxic-green text-xs">
                      {puzzle.puzzle_type}
                    </span>
                  </TableCell>
                  <TableCell>{puzzle.points}</TableCell>
                  <TableCell>{puzzle.time_limit_minutes}m</TableCell>
                  <TableCell>{puzzle.hint_count || 0}</TableCell>
                  <TableCell>{puzzle.submission_count || 0}</TableCell>
                  <TableCell>
                    {puzzle.is_active ? (
                      <span className="text-green-500">Active</span>
                    ) : (
                      <span className="text-red-500">Inactive</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(puzzle)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(puzzle)}
                      className="text-red-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-black border-toxic-green">
          <DialogHeader>
            <DialogTitle className="text-toxic-green">Create New Puzzle</DialogTitle>
            <DialogDescription>
              Fill in the puzzle details below
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="level">Level</Label>
                <Select
                  value={formData.level.toString()}
                  onValueChange={(value) => setFormData({ ...formData, level: parseInt(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Level 1</SelectItem>
                    <SelectItem value="2">Level 2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="puzzle_number">Puzzle Number</Label>
                <Input
                  id="puzzle_number"
                  name="puzzle_number"
                  type="number"
                  value={formData.puzzle_number}
                  onChange={(e) => setFormData({ ...formData, puzzle_number: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., System Access Breach"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Puzzle instructions..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="puzzle_type">Type</Label>
                <Select
                  value={formData.puzzle_type}
                  onValueChange={(value) => setFormData({ ...formData, puzzle_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="code">Code</SelectItem>
                    <SelectItem value="cipher">Cipher</SelectItem>
                    <SelectItem value="image">Image</SelectItem>
                    <SelectItem value="qr">QR Code</SelectItem>
                    <SelectItem value="html">HTML</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="points">Points</Label>
                <Input
                  id="points"
                  name="points"
                  type="number"
                  value={formData.points}
                  onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="puzzle_content">Puzzle Content</Label>
              <Textarea
                id="puzzle_content"
                name="puzzle_content"
                value={formData.puzzle_content}
                onChange={(e) => setFormData({ ...formData, puzzle_content: e.target.value })}
                placeholder="The actual puzzle content..."
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="correct_answer">Correct Answer</Label>
                <Input
                  id="correct_answer"
                  name="correct_answer"
                  value={formData.correct_answer}
                  onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                  placeholder="The answer..."
                />
              </div>

              <div>
                <Label htmlFor="time_limit">Time Limit (minutes)</Label>
                <Input
                  id="time_limit"
                  name="time_limit"
                  type="number"
                  value={formData.time_limit_minutes}
                  onChange={(e) => setFormData({ ...formData, time_limit_minutes: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createPuzzle.mutate(formData)}
              disabled={createPuzzle.isPending}
              className="bg-toxic-green text-black hover:bg-toxic-green/90"
            >
              {createPuzzle.isPending ? 'Creating...' : 'Create Puzzle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-black border-toxic-green">
          <DialogHeader>
            <DialogTitle className="text-toxic-green">Edit Puzzle</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div>
              <Label>Title</Label>
              <Input
                id="edit-title"
                name="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div>
              <Label>Description</Label>
              <Textarea
                id="edit-description"
                name="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
              />
            </div>

            <div>
              <Label>Puzzle Content</Label>
              <Textarea
                id="edit-puzzle-content"
                name="puzzle_content"
                value={formData.puzzle_content}
                onChange={(e) => setFormData({ ...formData, puzzle_content: e.target.value })}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Correct Answer</Label>
                <Input
                  id="edit-correct-answer"
                  name="correct_answer"
                  value={formData.correct_answer}
                  onChange={(e) => setFormData({ ...formData, correct_answer: e.target.value })}
                />
              </div>

              <div>
                <Label>Points</Label>
                <Input
                  id="edit-points"
                  name="points"
                  type="number"
                  value={formData.points}
                  onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => currentPuzzle && updatePuzzle.mutate({ id: currentPuzzle.id, data: formData })}
              disabled={updatePuzzle.isPending}
              className="bg-toxic-green text-black hover:bg-toxic-green/90"
            >
              {updatePuzzle.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="bg-black border-red-500">
          <DialogHeader>
            <DialogTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete Puzzle
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{currentPuzzle?.title}"? This action cannot be undone.
              All associated hints and submissions will also be deleted.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => currentPuzzle && deletePuzzle.mutate(currentPuzzle.id)}
              disabled={deletePuzzle.isPending}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              {deletePuzzle.isPending ? 'Deleting...' : 'Delete Puzzle'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

