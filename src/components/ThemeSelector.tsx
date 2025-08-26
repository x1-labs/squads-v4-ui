import React from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { Button } from './ui/button';

export const ThemeSelector: React.FC = () => {
  const { preference, setPreference } = useTheme();

  return (
    <div className="space-y-3">
      <div className="flex flex-col space-y-2">
        <label className="text-sm font-medium text-foreground">Choose theme</label>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant={preference === 'light' ? 'default' : 'outline'}
            onClick={() => setPreference('light')}
            className="w-full"
          >
            <Sun className="mr-2 h-4 w-4" />
            Light
          </Button>
          <Button
            variant={preference === 'dark' ? 'default' : 'outline'}
            onClick={() => setPreference('dark')}
            className="w-full"
          >
            <Moon className="mr-2 h-4 w-4" />
            Dark
          </Button>
          <Button
            variant={preference === 'system' ? 'default' : 'outline'}
            onClick={() => setPreference('system')}
            className="w-full"
          >
            <Monitor className="mr-2 h-4 w-4" />
            System
          </Button>
        </div>
      </div>
      {preference === 'system' && (
        <p className="text-xs text-muted-foreground">
          Theme will automatically match your system preference
        </p>
      )}
    </div>
  );
};