// Debug utilities for monitoring render cycles
export class RenderMonitor {
  private static renderCounts = new Map<string, number>();
  private static renderTimes = new Map<string, number[]>();
  
  static logRender(componentName: string) {
    const count = (this.renderCounts.get(componentName) || 0) + 1;
    this.renderCounts.set(componentName, count);
    
    const times = this.renderTimes.get(componentName) || [];
    times.push(Date.now());
    // Keep only last 100 render times
    if (times.length > 100) times.shift();
    this.renderTimes.set(componentName, times);
    
    // Log if rendering too frequently (more than 10 times in 1 second)
    const recentTimes = times.filter(t => Date.now() - t < 1000);
    if (recentTimes.length > 10) {
      console.warn(`🚨 ${componentName} is rendering excessively: ${recentTimes.length} renders in last second`);
    }
  }
  
  static getStats() {
    const stats: any = {};
    this.renderCounts.forEach((count, name) => {
      const times = this.renderTimes.get(name) || [];
      const recentTimes = times.filter(t => Date.now() - t < 5000);
      stats[name] = {
        totalRenders: count,
        recentRenders: recentTimes.length,
        renderRate: recentTimes.length / 5 // renders per second over last 5 seconds
      };
    });
    return stats;
  }
  
  static reset() {
    this.renderCounts.clear();
    this.renderTimes.clear();
  }
}

// Expose to window for console access
if (typeof window !== 'undefined') {
  (window as any).RenderMonitor = RenderMonitor;
}