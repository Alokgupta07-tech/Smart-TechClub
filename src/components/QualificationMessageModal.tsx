/**
 * ==============================================
 * QUALIFICATION MESSAGE MODAL
 * ==============================================
 * Displays qualification/disqualification messages to teams
 * Shows after level completion with animated effects
 * 
 * NEW CODE - Added for Level-Wise Qualification System
 */

import { useState, useEffect } from 'react';
import { Trophy, XCircle, X, ChevronRight, Clock, Target, Lightbulb, Award } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { 
  useQualificationMessages, 
  useMarkMessageRead, 
  useDismissMessage,
  QualificationMessage 
} from '@/hooks/useQualification';

interface QualificationMessageModalProps {
  autoShow?: boolean;
}

export function QualificationMessageModal({ autoShow = true }: QualificationMessageModalProps) {
  const [currentMessage, setCurrentMessage] = useState<QualificationMessage | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  const { data: messagesData } = useQualificationMessages(true); // Only unread
  const markReadMutation = useMarkMessageRead();
  const dismissMutation = useDismissMessage();

  // Auto-show unread messages
  useEffect(() => {
    if (autoShow && messagesData?.messages && messagesData.messages.length > 0) {
      const unreadMessage = messagesData.messages.find(m => !m.is_read && !m.is_dismissed);
      if (unreadMessage) {
        setCurrentMessage(unreadMessage);
        setIsOpen(true);
      }
    }
  }, [messagesData, autoShow]);

  const handleClose = async () => {
    if (currentMessage) {
      await markReadMutation.mutateAsync(currentMessage.id);
    }
    setIsOpen(false);
    setCurrentMessage(null);
  };

  const handleDismiss = async () => {
    if (currentMessage) {
      await dismissMutation.mutateAsync(currentMessage.id);
    }
    setIsOpen(false);
    setCurrentMessage(null);
  };

  if (!currentMessage) return null;

  const isQualified = currentMessage.message_type === 'QUALIFICATION';

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className={cn(
        "sm:max-w-lg border-2",
        isQualified 
          ? "border-toxic-green bg-background" 
          : "border-red-500 bg-background"
      )}>
        {/* Animated Background Effect */}
        <div className={cn(
          "absolute inset-0 opacity-10 rounded-lg",
          isQualified ? "bg-toxic-green" : "bg-red-500"
        )} />
        
        <DialogHeader className="relative z-10">
          <div className="flex justify-center mb-4">
            {isQualified ? (
              <div className="relative">
                <Trophy className="w-20 h-20 text-toxic-green animate-pulse" />
                <div className="absolute -inset-2 bg-toxic-green/20 rounded-full animate-ping" />
              </div>
            ) : (
              <XCircle className="w-20 h-20 text-red-500" />
            )}
          </div>
          
          <DialogTitle className={cn(
            "text-center text-2xl font-display",
            isQualified ? "text-toxic-green" : "text-red-500"
          )}>
            {currentMessage.title}
          </DialogTitle>
        </DialogHeader>

        <div className="relative z-10 py-4">
          {/* Message Content */}
          <div className="whitespace-pre-line text-sm text-muted-foreground leading-relaxed">
            {currentMessage.message}
          </div>

          {/* Performance Stats (if available in message) */}
          {isQualified && (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2 p-3 bg-toxic-green/10 rounded-lg border border-toxic-green/30">
                <Target className="w-5 h-5 text-toxic-green" />
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <p className="font-terminal text-toxic-green">QUALIFIED</p>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 bg-toxic-green/10 rounded-lg border border-toxic-green/30">
                <Award className="w-5 h-5 text-toxic-green" />
                <div>
                  <p className="text-xs text-muted-foreground">Next Level</p>
                  <p className="font-terminal text-toxic-green">UNLOCKED</p>
                </div>
              </div>
            </div>
          )}

          {!isQualified && (
            <div className="mt-6 p-4 bg-red-500/10 rounded-lg border border-red-500/30">
              <p className="text-sm text-red-400">
                Don't be discouraged! Every attempt is a learning opportunity.
                Thank you for participating in the competition.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="relative z-10 flex gap-2">
          <Button
            variant="outline"
            onClick={handleDismiss}
            className="flex-1"
          >
            <X className="w-4 h-4 mr-2" />
            Dismiss
          </Button>
          <Button
            onClick={handleClose}
            className={cn(
              "flex-1",
              isQualified 
                ? "bg-toxic-green text-black hover:bg-toxic-green/80"
                : "bg-muted hover:bg-muted/80"
            )}
          >
            {isQualified ? (
              <>
                Continue to Level 2
                <ChevronRight className="w-4 h-4 ml-2" />
              </>
            ) : (
              'Close'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Inline Qualification Banner
 * Shows at top of dashboard when qualification status changes
 */
interface QualificationBannerProps {
  levelId: number;
  status: 'PENDING' | 'QUALIFIED' | 'DISQUALIFIED';
  onDismiss?: () => void;
}

export function QualificationBanner({ levelId, status, onDismiss }: QualificationBannerProps) {
  if (status === 'PENDING') return null;

  const isQualified = status === 'QUALIFIED';

  return (
    <div className={cn(
      "w-full p-4 rounded-lg border-2 flex items-center justify-between mb-4",
      isQualified 
        ? "bg-toxic-green/10 border-toxic-green/30" 
        : "bg-red-500/10 border-red-500/30"
    )}>
      <div className="flex items-center gap-3">
        {isQualified ? (
          <Trophy className="w-6 h-6 text-toxic-green" />
        ) : (
          <XCircle className="w-6 h-6 text-red-500" />
        )}
        <div>
          <p className={cn(
            "font-terminal font-semibold",
            isQualified ? "text-toxic-green" : "text-red-500"
          )}>
            {isQualified 
              ? `Level ${levelId} Qualified!` 
              : `Level ${levelId} Not Qualified`}
          </p>
          <p className="text-xs text-muted-foreground">
            {isQualified 
              ? `You can now access Level ${levelId + 1}` 
              : 'Thank you for participating'}
          </p>
        </div>
      </div>
      {onDismiss && (
        <Button variant="ghost" size="icon" onClick={onDismiss}>
          <X className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

export default QualificationMessageModal;
