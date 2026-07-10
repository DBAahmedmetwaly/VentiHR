
'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Calculator, CheckCircle, Send, Printer, Loader2, Eye, Info, ListChecks, DollarSign, User, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, get, update, set } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, differenceInDays } from 'date-fns';
import { useReactToPrint } from 'react-to-print';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import * as XLSX from 'xlsx';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ---------------- Interfaces ----------------

interface Employee {
  id: string;
  employeeName: string;
  employeeCode: string;
  salary: number;
  workDaysPerMonth?: number;
  daysOff?: string[];
  shiftConfiguration?: "general" | "custom";
  checkInTime?: string;
  checkOutTime?: string;
  disableDeductions?: boolean;
}

interface AttendanceRecord {
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  delayMinutes?: number;
  status?: 'present' | 'absent' | 'weekly_off' | 'on_leave';
  delayAction?: 'none' | 'forgiven';
  overtimeMinutes?: number;
  overtimeStatus?: 'pending' | 'approved' | 'rejected';
}

interface FinancialTransaction {
    type: 'bonus' | 'penalty' | 'loan' | 'salary_advance';
    amount: number;
    date: string;
}

interface GlobalSettings {
    lateAllowance?: number;
    lateAllowanceScope?: 'daily' | 'monthly';
    deductionRules?: DeductionRule[];
    earlyLeaveDeductionRules?: DeductionRule[];
    workStartTime?: string;
    workEndTime?: string;
    companyName?: string;
}

interface DeductionRule {
    id: string;
    fromMinutes: number;
    toMinutes: number;
    deductionType: 'day_deduction' | 'fixed_amount' | 'hour_deduction' | 'minute_deduction';
    deductionValue: number;
}

interface DailyBreakdown {
    date: string;
    status: 'present' | 'absent' | 'off' | 'leave' | 'covered';
    delayMinutes: number;
    delayDeduction: number;
    earlyLeaveMinutes: number;
    earlyLeaveDeduction: number;
    overtimeMinutes: number;
    absenceDeduction: number;
    workHours: number;
    note: string;
}

interface PayrollItem {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    baseSalary: number; 
    proRatedSalary: number; 
    workDaysPerMonth: number;
    presentDaysCount: number;
    absentDaysCount: number;
    totalDelayMinutes: number;
    delayDeductions: number;
    totalEarlyLeaveMinutes: number;
    earlyLeaveDeductions: number;
    totalOvertimeMinutes: number;
    absenceDeductions: number;
    bonus: number;
    penalty: number;
    loanDeduction: number;
    salaryAdvanceDeductions: number;
    paid: boolean;
    netSalary: number;
    totalDeductionsValue: number;
    dailyBreakdown: DailyBreakdown[];
}

// ---------------- Payslip Component ----------------

function PayslipContent({ item, fromDate, toDate, companyName, formatCurrency }: { item: PayrollItem, fromDate: string, toDate: string, companyName?: string, formatCurrency: (v: number) => string }) {
    return (
        <div className="p-8 bg-white text-black font-sans text-sm print:p-10" dir="rtl" style={{ WebkitPrintColorAdjust: 'exact' } as any}>
            <div className="flex justify-between items-center border-b-4 border-primary pb-6 mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-primary">{companyName || "نظام إدارة الموارد البشرية"}</h1>
                    <p className="text-lg text-muted-foreground mt-1">كشف تفصيلي لمستحقات الراتب</p>
                </div>
                <div className="text-left bg-muted/30 p-3 rounded-md border">
                    <p className="font-bold">الفترة الزمنية:</p>
                    <p dir="ltr" className="font-mono text-sm">{fromDate} - {toDate}</p>
                    <p className="text-[10px] mt-2 text-muted-foreground">صدر في: {format(new Date(), 'yyyy/MM/dd HH:mm')}</p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-10">
                <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
                    <h3 className="font-bold border-b pb-2 text-primary">بيانات الموظف</h3>
                    <p className="flex justify-between"><span>الاسم:</span> <span className="font-bold">{item.employeeName}</span></p>
                    <p className="flex justify-between"><span>كود الموظف:</span> <span className="font-mono">{item.employeeCode}</span></p>
                    <p className="flex justify-between"><span>أيام الحضور الفعلي:</span> <span>{item.presentDaysCount} يوم</span></p>
                    <p className="flex justify-between"><span>أيام الغياب الصافي:</span> <span className={item.absentDaysCount > 0 ? "text-destructive font-bold" : ""}>{item.absentDaysCount} يوم</span></p>
                </div>
                <div className="space-y-3 p-4 border rounded-lg bg-slate-50">
                    <h3 className="font-bold border-b pb-2 text-primary">الراتب والأساسيات</h3>
                    <p className="flex justify-between"><span>الراتب الشهري الثابت:</span> <span className="font-mono">{formatCurrency(item.baseSalary)} ج.م</span></p>
                    <p className="flex justify-between"><span>قيمة اليوم الواحد:</span> <span className="font-mono">{formatCurrency(item.baseSalary / item.workDaysPerMonth)} ج.م</span></p>
                    <p className="flex justify-between"><span>أيام الشهر المحسوبة:</span> <span>{item.workDaysPerMonth} يوم</span></p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-10">
                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b-2 border-green-600 pb-2">
                        <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                        <h3 className="font-bold text-green-700 text-lg">الاستحقاقات والإضافات (+)</h3>
                    </div>
                    <div className="space-y-2 px-2">
                        <div className="flex justify-between border-b border-dashed pb-1"><span>راتب الفترة (المحقق):</span><span className="font-mono font-bold">{formatCurrency(item.proRatedSalary)}</span></div>
                        <div className="flex justify-between border-b border-dashed pb-1"><span>المكافآت الإدارية:</span><span className="font-mono text-green-600">+{formatCurrency(item.bonus)}</span></div>
                        <div className="pt-4 flex justify-between font-black text-green-700 border-t-2 border-green-200">
                            <span>إجمالي الاستحقاق:</span>
                            <span className="font-mono">{formatCurrency(item.proRatedSalary + item.bonus)} ج.م</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="flex items-center gap-2 border-b-2 border-orange-600 pb-2">
                        <div className="w-3 h-3 bg-orange-600 rounded-full"></div>
                        <h3 className="font-bold text-orange-700 text-lg">الاستقطاعات والخصومات (-)</h3>
                    </div>
                    <div className="space-y-2 px-2">
                        <div className="flex justify-between border-b border-dashed pb-1"><span>خصم تأخيرات الحضور:</span><span className="font-mono">-{formatCurrency(item.delayDeductions)}</span></div>
                        <div className="flex justify-between border-b border-dashed pb-1"><span>خصم انصراف مبكر:</span><span className="font-mono">-{formatCurrency(item.earlyLeaveDeductions)}</span></div>
                        <div className="flex justify-between border-b border-dashed pb-1"><span>خصم أيام الغياب:</span><span className="font-mono text-destructive">-{formatCurrency(item.absenceDeductions)}</span></div>
                        <div className="flex justify-between border-b border-dashed pb-1"><span>جزاءات إدارية:</span><span className="font-mono">-{formatCurrency(item.penalty)}</span></div>
                        <div className="flex justify-between border-b border-dashed pb-1"><span>سلف ومسحوبات سابقة:</span><span className="font-mono">-{formatCurrency(item.loanDeduction + item.salaryAdvanceDeductions)}</span></div>
                        <div className="pt-4 flex justify-between font-black text-orange-700 border-t-2 border-orange-200">
                            <span>إجمالي الاستقطاع:</span>
                            <span className="font-mono">{formatCurrency(item.totalDeductionsValue)} ج.م</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-12 p-6 bg-primary/5 border-4 border-double border-primary rounded-2xl flex justify-between items-center shadow-inner">
                <div>
                    <span className="text-2xl font-black text-primary">صافي الراتب المستحق للصرف:</span>
                    <p className="text-xs text-muted-foreground mt-1">تمت مراجعة السجلات وتدقيق الأوقات يدوياً وآلياً.</p>
                </div>
                <div className="text-right">
                    <span className="text-4xl font-black font-mono text-primary">{formatCurrency(item.netSalary)}</span>
                    <span className="text-xl font-bold mr-2 text-primary">ج.م</span>
                </div>
            </div>
        </div>
    );
}

// ---------------- Main Page ----------------

export default function PayrollPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const db = useDb();
  
  const [selectedPayslip, setSelectedPayslip] = useState<PayrollItem | null>(null);
  const payslipRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ 
      content: () => payslipRef.current,
      documentTitle: `Payroll_${selectedPayslip?.employeeName}_${fromDate}`,
      removeAfterPrint: true 
  });

  useEffect(() => {
    setIsMounted(true);
    setIsClient(true);
    const now = new Date();
    setFromDate(format(startOfMonth(now), 'yyyy-MM-dd'));
    setToDate(format(endOfMonth(now), 'yyyy-MM-dd'));
  }, []);

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  

  const formatCurrency = (amount: number) => isClient ? (amount || 0).toLocaleString('ar', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (amount || 0).toString();

  const handleCalculatePayroll = async () => {
    if (!db || !employeesData || !settings) {
        toast({ variant: "destructive", title: "بيانات ناقصة" });
        return;
    }
    
    setIsCalculating(true);
    try {
        const start = new Date(fromDate);
        const end = new Date(toDate);
        const periodDaysCount = differenceInDays(end, start) + 1;
        const daysInInterval = eachDayOfInterval({ start, end });

        const monthsNeeded = Array.from(new Set(daysInInterval.map(d => format(d, 'yyyy-MM'))));
        const attendanceSnapshots = await Promise.all(monthsNeeded.map(m => get(ref(db, `attendance/${m}`))));
        
        const allAttendance: AttendanceRecord[] = [];
        attendanceSnapshots.forEach(snap => {
            if (snap.exists()) {
                Object.values(snap.val() as Record<string, AttendanceRecord>).forEach(rec => {
                    if (rec.date && new Date(rec.date) >= start && new Date(rec.date) <= end) allAttendance.push(rec);
                });
            }
        });

        const [txSnap, reqSnap] = await Promise.all([get(ref(db, 'financial_transactions')), get(ref(db, 'employee_requests'))]);
        const allTransactions = txSnap.val() || {};
        const allRequests = reqSnap.val() || {};

        const results: PayrollItem[] = Object.entries(employeesData).map(([id, emp]) => {
            const dailyRate = (emp.salary || 0) / (emp.workDaysPerMonth || 30);
            const workHoursPerDay = settings.workStartTime && settings.workEndTime 
                ? (new Date(`1970-01-01T${settings.workEndTime}`).getTime() - new Date(`1970-01-01T${settings.workStartTime}`).getTime()) / (1000 * 60 * 60)
                : 8;
            const hourlyRate = dailyRate / (workHoursPerDay || 8);
            const minuteRate = hourlyRate / 60;
            const proRatedSalary = dailyRate * periodDaysCount;
            const empAtt = allAttendance.filter(a => a.employeeId === id);
            const breakdown: DailyBreakdown[] = [];
            const allowance = settings.lateAllowance || 0;
            const empDaysOff = emp.daysOff || [];

            const rulesRaw = settings.deductionRules;
            const deductionRules: DeductionRule[] = (Array.isArray(rulesRaw) ? rulesRaw : (rulesRaw ? Object.values(rulesRaw as any) : []))
                .filter((r: any): r is DeductionRule => !!r && typeof (r as any).fromMinutes === 'number')
                .sort((a,b) => a.fromMinutes - b.fromMinutes);
            
            const earlyRulesRaw = settings.earlyLeaveDeductionRules;
            const earlyDeductionRules: DeductionRule[] = (Array.isArray(earlyRulesRaw) ? earlyRulesRaw : (earlyRulesRaw ? Object.values(earlyRulesRaw as any) : []))
                .filter((r: any): r is DeductionRule => !!r && typeof (r as any).fromMinutes === 'number')
                .sort((a,b) => a.fromMinutes - b.fromMinutes);

            daysInInterval.forEach(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const isOff = empDaysOff.includes(getDay(day).toString());
                const att = empAtt.find(a => a.date === dayStr);
                
                let dayDetail: DailyBreakdown = { date: dayStr, status: isOff ? 'off' : 'absent', delayMinutes: 0, delayDeduction: 0, earlyLeaveMinutes: 0, earlyLeaveDeduction: 0, overtimeMinutes: 0, absenceDeduction: 0, workHours: 0, note: isOff ? 'إجازة أسبوعية' : 'غياب' };

                const hasLeave = allRequests[id] && Object.values(allRequests[id]).some((r: any) => r.status === 'approved' && r.requestType.startsWith('leave') && day >= new Date(r.startDate) && day <= new Date(r.endDate));

                if (hasLeave) {
                    dayDetail.status = 'leave';
                    dayDetail.note = 'إجازة معتمدة';
                } else if (att && (att.checkIn || att.status === 'present')) {
                    dayDetail.status = 'present';
                    dayDetail.delayMinutes = att.delayMinutes || 0;
                    dayDetail.overtimeMinutes = (att.overtimeStatus === 'approved' ? (att.overtimeMinutes || 0) : 0);
                    dayDetail.note = isOff ? 'عمل في يوم إجازة' : 'حضور';
                    
                    if (att.checkIn && att.checkOut) {
                        const actualDuration = new Date(att.checkOut).getTime() - new Date(att.checkIn).getTime();
                        // ADD OVERTIME TO WORK HOURS
                        dayDetail.workHours = (actualDuration / (1000 * 60 * 60)) + (dayDetail.overtimeMinutes / 60);
                    } else if (att.checkIn && dayDetail.overtimeMinutes > 0) {
                        dayDetail.workHours += (dayDetail.overtimeMinutes / 60);
                    }

                    if (!emp.disableDeductions && dayDetail.delayMinutes > allowance && att.delayAction !== 'forgiven') {
                        const chargeableMinutes = dayDetail.delayMinutes - allowance;
                        let rule = deductionRules.find(r => chargeableMinutes >= r.fromMinutes && chargeableMinutes <= r.toMinutes);
                        if (rule) {
                            let val = 0;
                            if (rule.deductionType === 'fixed_amount') val = rule.deductionValue;
                            else if (rule.deductionType === 'day_deduction') val = dailyRate * rule.deductionValue;
                            else if (rule.deductionType === 'hour_deduction') val = hourlyRate * rule.deductionValue;
                            else if (rule.deductionType === 'minute_deduction') val = minuteRate * rule.deductionValue;
                            dayDetail.delayDeduction = val;
                        }
                    }

                    if (att.checkOut) {
                        const officialOutStr = (emp.shiftConfiguration === 'custom' && emp.checkOutTime) || settings.workEndTime || '16:00';
                        const officialOutDate = new Date(`${dayStr}T${officialOutStr}:00`);
                        const actualOutDate = new Date(att.checkOut);
                        const isStrictlyNextDay = actualOutDate.getFullYear() > day.getFullYear() || actualOutDate.getMonth() > day.getMonth() || actualOutDate.getDate() > day.getDate();

                        if (actualOutDate.getTime() < officialOutDate.getTime() && !isStrictlyNextDay) {
                            const earlyMins = Math.floor((officialOutDate.getTime() - actualOutDate.getTime()) / 60000);
                            dayDetail.earlyLeaveMinutes = earlyMins;
                            let eRule = earlyDeductionRules.find(r => earlyMins >= r.fromMinutes && earlyMins <= r.toMinutes);
                            if (eRule) {
                                let eVal = 0;
                                if (eRule.deductionType === 'fixed_amount') eVal = eRule.deductionValue;
                                else if (eRule.deductionType === 'day_deduction') eVal = dailyRate * eRule.deductionValue;
                                else if (eRule.deductionType === 'hour_deduction') eVal = hourlyRate * eRule.deductionValue;
                                else if (eRule.deductionType === 'minute_deduction') eVal = minuteRate * eRule.deductionValue;
                                dayDetail.earlyLeaveDeduction = eVal;
                            }
                        }
                    }
                }
                breakdown.push(dayDetail);
            });

            const extraDaysIndices = breakdown.map((d, i) => d.status === 'present' && empDaysOff.includes(getDay(new Date(d.date)).toString()) ? i : -1).filter(i => i !== -1);
            const absentDaysIndices = breakdown.map((d, i) => d.status === 'absent' ? i : -1).filter(i => i !== -1);
            let extraUsed = 0;
            while (extraUsed < extraDaysIndices.length && absentDaysIndices.length > extraUsed) {
                const absIdx = absentDaysIndices[extraUsed];
                const extraIdx = extraDaysIndices[extraUsed];
                breakdown[absIdx].status = 'covered';
                breakdown[absIdx].note = `غياب مغطى بعمل يوم ${breakdown[extraIdx].date}`;
                extraUsed++;
            }

            const finalPresentDays = breakdown.filter(d => d.status === 'present' || d.status === 'covered').length;
            const finalAbsentDays = breakdown.filter(d => d.status === 'absent').length;
            const totalDelayDeduction = breakdown.reduce((acc, d) => acc + d.delayDeduction, 0);
            const totalEarlyLeaveDeduction = breakdown.reduce((acc, d) => acc + d.earlyLeaveDeduction, 0);
            const totalDelayMinutes = breakdown.reduce((acc, d) => acc + d.delayMinutes, 0);
            const totalEarlyLeaveMinutes = breakdown.reduce((acc, d) => acc + d.earlyLeaveMinutes, 0);
            const totalOvertimeMinutes = breakdown.reduce((acc, d) => acc + d.overtimeMinutes, 0);
            const totalAbsenceDeductions = finalAbsentDays * dailyRate;

            let bonus = 0, penalty = 0, loan = 0, advance = 0;
            if (allTransactions[id]) {
                Object.values(allTransactions[id]).forEach((monthTxs: any) => {
                    Object.values(monthTxs).forEach((tx: any) => {
                        const d = new Date(tx.date);
                        if (d >= start && d <= end) {
                            if (tx.type === 'bonus') bonus += tx.amount;
                            if (tx.type === 'penalty') penalty += tx.amount;
                            if (tx.type === 'loan') loan += tx.amount;
                            if (tx.type === 'salary_advance') advance += tx.amount;
                        }
                    });
                });
            }

            const totalDeductionsValue = totalDelayDeduction + totalEarlyLeaveDeduction + penalty + loan + advance + totalAbsenceDeductions;
            const netSalary = proRatedSalary + bonus - totalDeductionsValue;

            return { employeeId: id, employeeName: emp.employeeName, employeeCode: emp.employeeCode, baseSalary: emp.salary, proRatedSalary, workDaysPerMonth: emp.workDaysPerMonth || 30, presentDaysCount: finalPresentDays, absentDaysCount: finalAbsentDays, totalDelayMinutes, delayDeductions: totalDelayDeduction, totalEarlyLeaveMinutes, earlyLeaveDeductions: totalEarlyLeaveDeduction, totalOvertimeMinutes, absenceDeductions: totalAbsenceDeductions, bonus, penalty, loanDeduction: loan, salaryAdvanceDeductions: advance, paid: false, netSalary, totalDeductionsValue, dailyBreakdown: breakdown };
        });

        setPayrollData(results);
        toast({ title: 'تم الحساب بنجاح' });
    } catch (e) { console.error(e); toast({ variant: "destructive", title: "فشل الحساب" }); }
    finally { setIsCalculating(false); }
  };

  const handlePay = async (item: PayrollItem) => {
      if (!db) return;
      const batchId = format(new Date(), 'yyyyMMdd_HHmm');
      await set(ref(db, `payroll_history/${batchId}/${item.employeeId}`), { ...item, paid: true, fromDate, toDate });
      setPayrollData(prev => prev.map(p => p.employeeId === item.employeeId ? { ...p, paid: true } : p));
      toast({ title: `تم دفع راتب ${item.employeeName}` });
  };
  
  const handlePayAll = async () => {
    if (!db || payrollData.length === 0) return;
    const batchId = format(new Date(), 'yyyyMMdd_HHmm');
    const updates: any = {};
    payrollData.forEach(item => { updates[`/payroll_history/${batchId}/${item.employeeId}`] = { ...item, paid: true, fromDate, toDate }; });
    await update(ref(db), updates);
    setPayrollData(prev => prev.map(p => ({ ...p, paid: true })));
    toast({ title: 'تم حفظ ودفع رواتب الفترة للجميع' });
  };

  const handleExportToExcel = () => {
    const data = payrollData.map(item => ({ 'الموظف': item.employeeName, 'كود الموظف': item.employeeCode, 'الحضور': item.presentDaysCount, 'الغياب': item.absentDaysCount, 'راتب الفترة': item.proRatedSalary, 'مكافآت': item.bonus, 'خصم التأخير': item.delayDeductions, 'خصم الغياب': item.absenceDeductions, 'الصافي': item.netSalary }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'الرواتب');
    XLSX.writeFile(wb, `payroll_${fromDate}_to_${toDate}.xlsx`);
  };

  const isLoading = isEmployeesLoading || isSettingsLoading;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold font-headline text-primary">رواتب الفترة المخصصة</h2>
          {payrollData.length > 0 && <Button variant="outline" size="sm" onClick={handleExportToExcel}><FileSpreadsheet className="ml-2 h-4 w-4" />تصدير Excel</Button>}
      </div>
      <Card>
        <CardHeader>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-2">
            <div className="space-y-1"><Label className="text-xs">من تاريخ</Label><Input type="date" value={isMounted ? fromDate : ''} onChange={e => setFromDate(e.target.value)} className="h-9" /></div>
            <div className="space-y-1"><Label className="text-xs">إلى تاريخ</Label><Input type="date" value={isMounted ? toDate : ''} onChange={e => setToDate(e.target.value)} className="h-9" /></div>
            <Button onClick={handleCalculatePayroll} disabled={isLoading || isCalculating}>{isCalculating ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Calculator className="ml-2 h-4 w-4" />} حساب الرواتب</Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table className="whitespace-nowrap">
                <TableHeader><TableRow><TableHead className="text-right">الموظف</TableHead><TableHead className="text-right">ح/غ</TableHead><TableHead className="text-left">استحقاق الفترة</TableHead><TableHead className="text-left text-orange-600">خصم الغياب</TableHead><TableHead className="text-left text-orange-600">إجمالي الخصم</TableHead><TableHead className="font-bold text-primary text-left">الصافي</TableHead><TableHead className="text-center">إجراءات</TableHead></TableRow></TableHeader>
                <TableBody>
                {!isCalculating && payrollData.map((item) => (
                        <TableRow key={item.employeeId}>
                            <TableCell className="text-right py-2"><div className="font-medium">{item.employeeName}</div><div className="text-[10px] text-muted-foreground font-mono">{item.employeeCode}</div></TableCell>
                            <TableCell className="text-right py-2"><div className="text-xs">{item.presentDaysCount} ح / <span className={cn("font-bold", item.absentDaysCount > 0 ? "text-destructive" : "text-green-600")}>{item.absentDaysCount} غ</span></div></TableCell>
                            <TableCell className="text-left font-mono text-xs">{formatCurrency(item.proRatedSalary)}</TableCell>
                            <TableCell className="text-orange-600 text-left font-mono text-xs font-bold">-{formatCurrency(item.absenceDeductions)}</TableCell>
                            <TableCell className="text-orange-600 text-left font-mono text-xs">-{formatCurrency(item.totalDeductionsValue)}</TableCell>
                            <TableCell className="font-bold text-primary text-left font-mono text-sm">{formatCurrency(item.netSalary)}</TableCell>
                            <TableCell className="text-center py-2"><div className="flex justify-center gap-1"><Button variant="ghost" size="icon" onClick={() => setSelectedPayslip(item)}><Eye className="h-4 w-4 text-primary" /></Button>{item.paid ? <Badge variant="secondary">تم</Badge> : <Button size="sm" onClick={() => handlePay(item)}>دفع</Button>}</div></TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
       <Dialog open={!!selectedPayslip} onOpenChange={(open) => !open && setSelectedPayslip(null)}>
            <DialogContent className="max-w-5xl p-0 h-[90vh] flex flex-col">
                <DialogHeader className="p-4 border-b bg-muted/20 flex-shrink-0"><DialogTitle>تفاصيل مستحقات {selectedPayslip?.employeeName}</DialogTitle></DialogHeader>
                {selectedPayslip && (
                    <Tabs defaultValue="breakdown" className="flex-grow flex flex-col overflow-hidden">
                        <TabsList className="mx-4 mt-2"><TabsTrigger value="breakdown">سجل التفاصيل</TabsTrigger><TabsTrigger value="payslip">قسيمة الراتب</TabsTrigger></TabsList>
                        <TabsContent value="breakdown" className="flex-grow overflow-hidden flex flex-col p-4">
                            <div className="w-full overflow-x-auto border rounded-lg bg-card">
                                <Table className="whitespace-nowrap min-w-[800px]">
                                    <TableHeader><TableRow><TableHead className="text-right">التاريخ</TableHead><TableHead className="text-right">الحالة</TableHead><TableHead className="text-left">ساعات العمل</TableHead><TableHead className="text-left text-orange-600">خصم التأخير</TableHead><TableHead className="text-left text-green-600">إضافي (د)</TableHead><TableHead className="text-left text-orange-600">خصم غياب</TableHead><TableHead className="text-right">ملاحظة</TableHead></TableRow></TableHeader>
                                    <TableBody>
                                        {selectedPayslip.dailyBreakdown.map((day, idx) => (
                                            <TableRow key={idx} className={cn(day.status === 'absent' && 'bg-orange-50')}>
                                                <TableCell className="text-right font-mono text-xs">{day.date}</TableCell>
                                                <TableCell className="text-right"><Badge variant={day.status === 'present' ? 'secondary' : day.status === 'absent' ? 'destructive' : 'default'}>{day.status}</Badge></TableCell>
                                                <TableCell className="text-left font-mono font-bold text-primary">{day.workHours.toFixed(2)} س</TableCell>
                                                <TableCell className="text-left text-orange-600 font-mono">-{formatCurrency(day.delayDeduction)}</TableCell>
                                                <TableCell className="text-left text-green-600 font-bold">+{day.overtimeMinutes}</TableCell>
                                                <TableCell className="text-left text-orange-600">-{formatCurrency(day.absenceDeduction)}</TableCell>
                                                <TableCell className="text-right text-[10px] text-muted-foreground">{day.note}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </TabsContent>
                        <TabsContent value="payslip" className="flex-grow overflow-auto p-4"><div ref={payslipRef} className="bg-white"><PayslipContent item={selectedPayslip} fromDate={fromDate} toDate={toDate} companyName={settings?.companyName} formatCurrency={formatCurrency} /></div><div className="p-4 border-t flex justify-end gap-2 bg-background sticky bottom-0 z-10"><Button onClick={handlePrint}><Printer className="ml-2 h-5 w-5"/>طباعة أو حفظ (PDF)</Button></div></TabsContent>
                    </Tabs>
                )}
            </DialogContent>
        </Dialog>
    </div>
  );
}
