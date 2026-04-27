
'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Calculator, CheckCircle, Send, Printer, Loader2, Share2, Eye, CalendarDays, UserCheck, Plane, ArrowLeftRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, get, update } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { format, subDays, startOfMonth, endOfMonth, eachDayOfInterval, getDay, differenceInHours, isSameDay, differenceInDays } from 'date-fns';
import { useReactToPrint } from 'react-to-print';
import { arEG } from 'date-fns/locale';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';


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
  earlyLeaveMinutes?: number;
  status?: 'present' | 'absent' | 'weekly_off' | 'on_leave';
}

interface FinancialTransaction {
    type: 'bonus' | 'penalty' | 'loan' | 'salary_advance';
    amount: number;
    date: string;
}

interface EmployeeRequest {
  requestType: "leave_full_day" | "leave_half_day" | "mission" | "permission_early" | "permission_late";
  status: "approved";
  startDate: string;
  endDate: string;
  durationHours?: number;
}

interface FixedDeduction {
    id: string;
    name: string;
    type: 'fixed' | 'percentage';
    value: number;
    transactionType: 'deduction' | 'addition';
}

interface DeductionRule {
    fromMinutes: number;
    toMinutes: number;
    deductionType: 'day_deduction' | 'fixed_amount' | 'hour_deduction' | 'minute_deduction';
    deductionValue: number;
}

interface GlobalSettings {
    deductionForAbsence?: number;
    deductionForIncompleteRecord?: number;
    lateAllowance?: number;
    lateAllowanceScope?: 'daily' | 'monthly';
    deductionRules?: DeductionRule[];
    earlyLeaveDeductionRules?: DeductionRule[];
    workStartTime?: string;
    workEndTime?: string;
    companyName?: string;
    fixedDeductions?: FixedDeduction[];
}

interface PayrollItem {
    employeeId: string;
    employeeName: string;
    employeeCode: string;
    baseSalary: number; // Full month salary
    proRatedSalary: number; // Salary for selected period
    workDaysPerMonth: number;
    presentDaysCount: number;
    absentDaysCount: number;
    approvedLeaveDaysCount: number;
    totalDelayMinutes: number;
    delayDeductions: number;
    bonus: number;
    penalty: number;
    loanDeduction: number;
    salaryAdvanceDeductions: number;
    paid: boolean;
    fixedDeductions: { name: string; amount: number }[];
    fixedAdditions: { name: string; amount: number }[];
}

interface PayslipProps {
    item: PayrollItem;
    fromDate: string;
    toDate: string;
    payable: number;
    companyName?: string;
    formatCurrency: (amount: number) => string | number;
}

// ---------------- Helper Components ----------------

function Payslip({ item, fromDate, toDate, payable, companyName, formatCurrency }: PayslipProps) {
    const totalAdditionsVal = item.bonus + item.fixedAdditions.reduce((acc, add) => acc + add.amount, 0);
    const totalDeductionsVal = item.delayDeductions + item.penalty + item.loanDeduction + item.salaryAdvanceDeductions + (item.absentDaysCount * (item.baseSalary / item.workDaysPerMonth)) + item.fixedDeductions.reduce((acc, ded) => acc + ded.amount, 0);
    
    return (
        <div className="p-6 bg-white text-black font-sans text-xs" dir="rtl">
            <header className="flex justify-between items-center pb-4 border-b-2 border-gray-200">
                <div>
                    <h1 className="text-xl font-bold text-gray-800">{companyName || "اسم الشركة"}</h1>
                    <p className="text-gray-500">كشف راتب فترة</p>
                </div>
                <div className="text-left">
                    <p className="font-semibold">من: {fromDate} إلى: {toDate}</p>
                    <p className="text-[10px] text-gray-400">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
                </div>
            </header>

            <section className="my-4 p-3 bg-gray-50 rounded-lg">
                <h2 className="text-sm font-bold mb-2">بيانات الموظف</h2>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <div><span className="font-semibold">الاسم:</span> {item.employeeName}</div>
                    <div><span className="font-semibold">الكود:</span> {item.employeeCode}</div>
                    <div><span className="font-semibold">أيام الفترة:</span> {differenceInDays(new Date(toDate), new Date(fromDate)) + 1} يوم</div>
                    <div><span className="font-semibold">الحضور الفعلي:</span> {item.presentDaysCount} يوم</div>
                </div>
            </section>

            <section className="my-4 grid grid-cols-2 gap-4">
                <div>
                    <h2 className="text-sm font-bold mb-2 pb-1 border-b">الاستحقاقات</h2>
                    <div className="space-y-1">
                        <div className="flex justify-between"><span>راتب الفترة المكتسب</span><span className="font-mono">{formatCurrency(item.proRatedSalary)}</span></div>
                        <div className="flex justify-between"><span>مكافآت</span><span className="font-mono">{formatCurrency(item.bonus)}</span></div>
                        {item.fixedAdditions.map(add => (
                            <div key={add.name} className="flex justify-between"><span>{add.name}</span><span className="font-mono">{formatCurrency(add.amount)}</span></div>
                        ))}
                    </div>
                </div>

                <div>
                    <h2 className="text-sm font-bold mb-2 pb-1 border-b">الاستقطاعات</h2>
                    <div className="space-y-1">
                        <div className="flex justify-between"><span>خصم تأخير</span><span className="font-mono">{formatCurrency(item.delayDeductions)}</span></div>
                        <div className="flex justify-between"><span>خصم غياب</span><span className="font-mono">{formatCurrency(item.absentDaysCount * (item.baseSalary / item.workDaysPerMonth))}</span></div>
                        <div className="flex justify-between"><span>جزاءات</span><span className="font-mono">{formatCurrency(item.penalty)}</span></div>
                        <div className="flex justify-between"><span>قسط سلفة</span><span className="font-mono">{formatCurrency(item.loanDeduction)}</span></div>
                        {item.fixedDeductions.map(ded => (
                            <div key={ded.name} className="flex justify-between"><span>{ded.name}</span><span className="font-mono">{formatCurrency(ded.amount)}</span></div>
                        ))}
                    </div>
                </div>
            </section>

            <footer className="mt-6 pt-4 border-t-2 border-gray-200">
                <div className="flex justify-between items-center bg-gray-100 p-3 rounded-lg">
                    <span className="text-lg font-bold">صافي المستحق</span>
                    <span className="text-xl font-bold font-mono text-green-700">{formatCurrency(payable)} ج.م</span>
                </div>
            </footer>
        </div>
    );
}

// ---------------- Payroll Page Component ----------------

export default function PayrollPage() {
  const [fromDate, setFromDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [payrollData, setPayrollData] = useState<PayrollItem[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const { toast } = useToast();
  const db = useDb();
  
  const [sharingItem, setSharingItem] = useState<PayrollItem | null>(null);

  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Omit<Employee, 'id'>>>(employeesRef);
  
  const settingsRef = useMemoFirebase(() => db ? ref(db, 'global_settings/main') : null, [db]);
  const [settings, isSettingsLoading] = useDbData<GlobalSettings>(settingsRef);
  
  useEffect(() => { setIsClient(true); }, []);

  const calculateDisplayValues = (item: PayrollItem) => {
    const dailyRate = item.baseSalary / item.workDaysPerMonth;
    const totalAdditions = item.bonus + item.fixedAdditions.reduce((acc, add) => acc + add.amount, 0);
    const absenceDeduction = item.absentDaysCount * dailyRate;
    const totalDeductions = item.delayDeductions + absenceDeduction + item.penalty + item.loanDeduction + item.salaryAdvanceDeductions + item.fixedDeductions.reduce((acc, ded) => acc + ded.amount, 0);
    const netSalary = item.proRatedSalary + totalAdditions - totalDeductions;
    return { netSalary, totalAdditions, totalDeductions, absenceDeduction };
  };

  const handleCalculatePayroll = async () => {
    if (!db || !employeesData || !settings) {
        toast({ variant: "destructive", title: "بيانات ناقصة" });
        return;
    }
    
    setIsCalculating(true);
    try {
        const start = new Date(fromDate);
        const end = new Date(toDate);
        const daysInPeriod = eachDayOfInterval({ start, end });
        const periodDayCount = daysInPeriod.length;

        // Fetch all needed months for attendance
        const monthsNeeded = Array.from(new Set(daysInPeriod.map(d => format(d, 'yyyy-MM'))));
        const attendancePromises = monthsNeeded.map(m => get(ref(db, `attendance/${m}`)));
        const attendanceSnapshots = await Promise.all(attendancePromises);
        
        const allAttendance: AttendanceRecord[] = [];
        attendanceSnapshots.forEach(snap => {
            if (snap.exists()) {
                Object.values(snap.val() as Record<string, AttendanceRecord>).forEach(rec => {
                    const recDate = new Date(rec.date);
                    if (recDate >= start && recDate <= end) allAttendance.push(rec);
                });
            }
        });

        // Fetch Transactions & Requests (full fetch for simplicity in this study)
        const [txSnap, reqSnap] = await Promise.all([
            get(ref(db, 'financial_transactions')),
            get(ref(db, 'employee_requests'))
        ]);
        const allTransactions = txSnap.val() || {};
        const allRequests = reqSnap.val() || {};

        const results: PayrollItem[] = Object.entries(employeesData).map(([id, emp]) => {
            const employee: Employee = { ...emp, id };
            const dailyRate = employee.salary / (employee.workDaysPerMonth || 30);
            const proRatedSalary = dailyRate * periodDayCount;

            const empAttendance = allAttendance.filter(a => a.employeeId === id);
            const presentDays = new Set(empAttendance.filter(a => a.status === 'present' || (!a.status && a.checkIn)).map(a => a.date));
            
            // Calculate Absences (Working days with no attendance or approved leave)
            let absentCount = 0;
            const empDaysOff = employee.daysOff || ['5'];
            const empRequests = allRequests[id] ? Object.values(allRequests[id]) as EmployeeRequest[] : [];

            daysInPeriod.forEach(day => {
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayOfWeek = getDay(day).toString();
                if (empDaysOff.includes(dayOfWeek)) return; // Weekend
                
                if (presentDays.has(dayStr)) return; // Present
                
                const hasLeave = empRequests.some(r => r.status === 'approved' && r.requestType.startsWith('leave') && day >= new Date(r.startDate) && day <= new Date(r.endDate));
                if (hasLeave) return;

                absentCount++;
            });

            // Delay Deductions
            let delayDeductions = 0;
            const totalDelay = employee.disableDeductions ? 0 : empAttendance.reduce((acc, curr) => acc + (curr.delayMinutes || 0), 0);
            if (totalDelay > (settings.lateAllowance || 0)) {
                const rules = Array.isArray(settings.deductionRules) ? settings.deductionRules : Object.values(settings.deductionRules || {});
                const rule = rules.sort((a,b) => a.fromMinutes - b.fromMinutes).find(r => totalDelay >= r.fromMinutes && totalDelay <= r.toMinutes);
                if (rule) {
                    if (rule.deductionType === 'day_deduction') delayDeductions = dailyRate * rule.deductionValue;
                    else if (rule.deductionType === 'fixed_amount') delayDeductions = rule.deductionValue;
                }
            }

            // Financial Transactions in period
            let bonus = 0, penalty = 0, loan = 0, advance = 0;
            if (allTransactions[id]) {
                Object.values(allTransactions[id]).forEach(monthTxs => {
                    Object.values(monthTxs as Record<string, FinancialTransaction>).forEach(tx => {
                        const txDate = new Date(tx.date);
                        if (txDate >= start && txDate <= end) {
                            if (tx.type === 'bonus') bonus += tx.amount;
                            if (tx.type === 'penalty') penalty += tx.amount;
                            if (tx.type === 'loan') loan += tx.amount;
                            if (tx.type === 'salary_advance') advance += tx.amount;
                        }
                    });
                });
            }

            // Fixed Items
            const fixedDeductions: { name: string; amount: number }[] = [];
            const fixedAdditions: { name: string; amount: number }[] = [];
            const fixedItems = Array.isArray(settings.fixedDeductions) ? settings.fixedDeductions : Object.values(settings.fixedDeductions || {});
            fixedItems.forEach(item => {
                const amt = item.type === 'fixed' ? item.value : (employee.salary / 100) * item.value;
                const periodAmt = (amt / 30) * periodDayCount; // Pro-rate fixed items too? Usually yes for periods.
                if (item.transactionType === 'deduction') fixedDeductions.push({ name: item.name, amount: periodAmt });
                else fixedAdditions.push({ name: item.name, amount: periodAmt });
            });

            return {
                employeeId: id,
                employeeName: employee.employeeName,
                employeeCode: employee.employeeCode,
                baseSalary: employee.salary,
                proRatedSalary,
                workDaysPerMonth: employee.workDaysPerMonth || 30,
                presentDaysCount: presentDays.size,
                absentDaysCount: absentCount,
                approvedLeaveDaysCount: 0, // Simplified
                totalDelayMinutes: totalDelay,
                delayDeductions,
                bonus,
                penalty,
                loanDeduction: loan,
                salaryAdvanceDeductions: advance,
                paid: false,
                fixedDeductions,
                fixedAdditions,
            };
        });

        setPayrollData(results);
        toast({ title: 'تم الحساب بنجاح' });
    } catch (e) {
        toast({ variant: "destructive", title: "فشل الحساب" });
    } finally {
        setIsCalculating(false);
    }
  };
  
  const handlePayAll = async () => {
    if (!db || payrollData.length === 0) return;
    const updates: { [key: string]: any } = {};
    const batchId = format(new Date(), 'yyyyMMdd_HHmm');
    payrollData.forEach(item => {
        updates[`/payroll_history/${batchId}/${item.employeeId}`] = { ...item, paid: true, fromDate, toDate };
    });
    await update(ref(db), updates);
    setPayrollData(prev => prev.map(p => ({ ...p, paid: true })));
    toast({ title: 'تم حفظ السجلات ودفع الرواتب' });
  };

  const formatCurrency = (amount: number) => (isClient ? amount.toLocaleString('ar', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : amount);
  const isLoading = isEmployeesLoading || isSettingsLoading;
  
  const payslipRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({ content: () => payslipRef.current });
  const [selectedPayslip, setSelectedPayslip] = useState<{item: PayrollItem, payable: number} | null>(null);

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold font-headline">رواتب الفترة المخصصة</h2>
      <Card>
        <CardHeader className="p-4">
          <CardTitle className="text-lg">تحديد فترة الحساب</CardTitle>
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end pt-2">
            <div className="space-y-1">
              <Label className="text-xs">من تاريخ</Label>
              <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">إلى تاريخ</Label>
              <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="h-8 text-sm" />
            </div>
            <Button onClick={handleCalculatePayroll} disabled={isLoading || isCalculating} className="h-8">
              {isCalculating ? <Loader2 className="ml-2 h-4 w-4 animate-spin"/> : <Calculator className="ml-2 h-4 w-4" />}
              حساب الرواتب
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="hidden md:block">
            <Table>
                <TableHeader>
                <TableRow className="h-10">
                    <TableHead className="text-right text-xs">الموظف</TableHead>
                    <TableHead className="text-right text-xs">الحضور / الغياب</TableHead>
                    <TableHead className="text-left text-xs">استحقاق الفترة</TableHead>
                    <TableHead className="text-left text-xs">الإضافات</TableHead>
                    <TableHead className="text-left text-xs">الخصومات</TableHead>
                    <TableHead className="font-bold text-primary text-left text-xs">الصافي</TableHead>
                    <TableHead className="text-center text-xs">إجراءات</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {isLoading && !isCalculating ? (
                    Array.from({length: 3}).map((_, i) => <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full"/></TableCell></TableRow>)
                ) : payrollData.length > 0 ? (
                    payrollData.map((item) => {
                        const { netSalary, totalAdditions, totalDeductions, absenceDeduction } = calculateDisplayValues(item);
                        return (
                            <TableRow key={item.employeeId} className="h-12">
                                <TableCell className="text-right py-2">
                                    <div className="font-medium text-sm">{item.employeeName}</div>
                                    <div className="text-[10px] text-muted-foreground font-mono">{item.employeeCode}</div>
                                </TableCell>
                                <TableCell className="text-right py-2">
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-1 justify-end font-bold text-blue-600 text-xs">
                                            <UserCheck className="h-3 w-3"/> {item.presentDaysCount} ح
                                        </div>
                                        {item.absentDaysCount > 0 && (
                                            <div className="flex items-center gap-1 justify-end font-medium text-destructive text-xs">
                                                <Badge variant="destructive" className="px-1 h-4 text-[9px]">{item.absentDaysCount} غ</Badge>
                                            </div>
                                        )}
                                    </div>
                                </TableCell>
                                <TableCell className="text-left font-mono text-xs">{formatCurrency(item.proRatedSalary)}</TableCell>
                                <TableCell className="text-green-600 text-left font-mono text-xs">+{formatCurrency(totalAdditions)}</TableCell>
                                <TableCell className="text-destructive text-left font-mono text-xs">-{formatCurrency(totalDeductions)}</TableCell>
                                <TableCell className="font-bold text-primary text-left font-mono text-sm">{formatCurrency(netSalary)}</TableCell>
                                <TableCell className="text-center py-2">
                                    <div className="flex items-center justify-center gap-1">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedPayslip({ item, payable: netSalary })}>
                                            <Printer className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )
                    })
                ) : (
                    <TableRow><TableCell colSpan={7} className="h-20 text-center text-sm text-muted-foreground">حدد الفترة واضغط حساب للبدء.</TableCell></TableRow>
                )}
                </TableBody>
            </Table>
          </div>

          <div className="md:hidden space-y-2 p-2">
            {payrollData.map(item => {
                const { netSalary, totalAdditions, totalDeductions } = calculateDisplayValues(item);
                return (
                    <Card key={item.employeeId} className="border shadow-none">
                        <CardContent className="p-3 space-y-2 text-xs">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="font-bold text-sm">{item.employeeName}</p>
                                    <p className="text-[10px] text-muted-foreground">{item.employeeCode}</p>
                                </div>
                                <Badge variant="outline" className="text-[10px]">{item.presentDaysCount} حضور / {item.absentDaysCount} غياب</Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2 border-t pt-2 mt-1">
                                <div><p className="text-muted-foreground text-[10px]">استحقاق</p><p className="font-mono">{formatCurrency(item.proRatedSalary)}</p></div>
                                <div><p className="text-muted-foreground text-[10px]">إضافات</p><p className="text-green-600 font-mono">+{formatCurrency(totalAdditions)}</p></div>
                                <div><p className="text-muted-foreground text-[10px]">خصومات</p><p className="text-destructive font-mono">-{formatCurrency(totalDeductions)}</p></div>
                            </div>
                            <div className="flex justify-between items-center border-t pt-2 mt-1">
                                <span className="font-bold text-primary">الصافي: {formatCurrency(netSalary)} ج.م</span>
                                <Button variant="outline" size="sm" className="h-7 px-2 text-[10px]" onClick={() => setSelectedPayslip({ item, payable: netSalary })}>
                                    <Eye className="ml-1 h-3 w-3" /> معاينة
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )
            })}
          </div>
        </CardContent>
        {payrollData.length > 0 && (
          <CardFooter className="flex justify-end p-4 border-t">
             <Button size="sm" onClick={handlePayAll} disabled={payrollData.every(p => p.paid)}>
               <Send className="ml-2 h-4 w-4"/>
               تثبيت ودفع رواتب الفترة
            </Button>
          </CardFooter>
        )}
      </Card>
      
       <Dialog open={!!selectedPayslip} onOpenChange={(open) => !open && setSelectedPayslip(null)}>
            <DialogContent className="max-w-2xl p-0 overflow-hidden">
                <DialogHeader className="p-4 border-b bg-muted/20">
                    <DialogTitle className="text-sm">معاينة قسيمة الراتب</DialogTitle>
                </DialogHeader>
                {selectedPayslip && (
                    <>
                        <div ref={payslipRef} className="bg-white">
                           <Payslip item={selectedPayslip.item} fromDate={fromDate} toDate={toDate} payable={selectedPayslip.payable} companyName={settings?.companyName} formatCurrency={formatCurrency} />
                        </div>
                        <div className="p-4 border-t flex justify-end gap-2 bg-muted/10">
                            <Button variant="outline" size="sm" onClick={() => setSelectedPayslip(null)}>إغلاق</Button>
                            <Button size="sm" onClick={handlePrint}><Printer className="ml-2 h-4 w-4"/>طباعة</Button>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    </div>
  );
}
