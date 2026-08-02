
'use client';

import { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDb, useDbData, useMemoFirebase } from '@/firebase';
import { ref, update } from 'firebase/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { format, subMonths } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Clock, Filter, Users, Calendar, TrendingUp, Check, X, Edit2, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Employee {
  id: string;
  employeeName: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut?: string;
  officialCheckOutTime?: string;
  overtimeMinutes?: number;
  overtimeStatus?: 'pending' | 'approved' | 'rejected';
}

export default function OvertimeReportPage() {
  const [isMounted, setIsMounted] = useState(false);
  const db = useDb();
  const { toast } = useToast();
  const [reportMonth, setReportMonth] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any>(null);
  const [editMinutes, setEditMinutes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setReportMonth(format(new Date(), 'yyyy-MM'));
  }, []);

  // --- Data Fetching ---
  const employeesRef = useMemoFirebase(() => db ? ref(db, 'employees') : null, [db]);
  const [employeesData, isEmployeesLoading] = useDbData<Record<string, Employee>>(employeesRef);

  const attendanceRef = useMemoFirebase(() => (db && reportMonth) ? ref(db, `attendance/${reportMonth}`) : null, [db, reportMonth]);
  const [attendanceData, isAttendanceLoading] = useDbData<Record<string, AttendanceRecord>>(attendanceRef);

  const employeesMap = useMemo(() => {
    if (!employeesData) return new Map();
    return new Map(Object.entries(employeesData).map(([id, emp]) => [id, emp.employeeName]));
  }, [employeesData]);

  const allRecords = useMemo(() => {
    if (!attendanceData || !isMounted) return [];

    return Object.entries(attendanceData)
      .map(([id, rec]) => {
          // Identify potential overtime even if not marked
          let potentialOvertime = rec.overtimeMinutes || 0;
          if (!rec.overtimeStatus && rec.checkOut && rec.officialCheckOutTime) {
             const actualOut = new Date(rec.checkOut).getTime();
             const [h, m] = rec.officialCheckOutTime.split(':').map(Number);
             const officialOut = new Date(rec.checkOut);
             officialOut.setHours(h, m, 0, 0);
             if (actualOut > officialOut.getTime()) {
                 potentialOvertime = Math.floor((actualOut - officialOut.getTime()) / 60000);
             }
          }

          return {
            ...rec,
            id,
            potentialOvertime,
            employeeName: employeesMap.get(rec.employeeId) || 'غير معروف'
          };
      })
      .filter(rec => 
        (rec.overtimeStatus || rec.potentialOvertime > 0) &&
        rec.employeeName.toLowerCase().includes(searchTerm.toLowerCase())
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [attendanceData, employeesMap, searchTerm, isMounted]);

  const stats = useMemo(() => {
    const approved = allRecords.filter(r => r.overtimeStatus === 'approved');
    const totalMinutes = approved.reduce((acc, curr) => acc + (curr.overtimeMinutes || 0), 0);
    const pendingCount = allRecords.filter(r => !r.overtimeStatus || r.overtimeStatus === 'pending').length;
    return {
      totalMinutes,
      totalHours: (totalMinutes / 60).toFixed(2),
      approvedCount: approved.length,
      pendingCount
    };
  }, [allRecords]);

  const handleAction = async (record: any, status: 'approved' | 'rejected', minutes?: number) => {
    if (!db || isProcessing) return;
    setIsProcessing(true);
    try {
        const finalMinutes = minutes !== undefined ? minutes : (record.overtimeMinutes || record.potentialOvertime);
        await update(ref(db, `attendance/${reportMonth}/${record.id}`), {
            overtimeStatus: status,
            overtimeMinutes: status === 'approved' ? finalMinutes : 0
        });
        toast({ title: status === 'approved' ? 'تم اعتماد الوقت الإضافي' : 'تم رفض الوقت الإضافي' });
        setIsEditOpen(false);
    } catch (error) {
        toast({ variant: 'destructive', title: 'فشل التحديث' });
    } finally {
        setIsProcessing(false);
    }
  };

  const openEdit = (record: any) => {
      setSelectedRecord(record);
      setEditMinutes((record.overtimeMinutes || record.potentialOvertime).toString());
      setIsEditOpen(true);
  };

  const months = Array.from({ length: 12 }, (_, i) => format(subMonths(new Date(), i), 'yyyy-MM'));
  const isLoading = isEmployeesLoading || isAttendanceLoading || !isMounted;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-headline font-bold tracking-tight flex items-center gap-2 text-primary">
          <Clock className="h-8 w-8" />
          إدارة الوقت الإضافي
        </h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" /> تصفية السجلات</CardTitle>
          <CardDescription>راجع واعتمد ساعات العمل الإضافية للموظفين.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>الشهر</Label>
              <Select dir="rtl" value={reportMonth} onValueChange={setReportMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m} value={m}>
                      {new Date(m + "-02").toLocaleString("ar", { month: "long", year: "numeric" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>بحث عن موظف</Label>
              <Input 
                placeholder="اسم الموظف..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-green-50 border-green-100">
          <CardHeader className="p-4 pb-1"><CardTitle className="text-xs text-green-700">إجمالي المعتمد</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-xl font-bold text-green-700 font-mono">{stats.totalHours} <span className="text-xs">ساعة</span></div>
          </CardContent>
        </Card>
        <Card className={cn(stats.pendingCount > 0 ? "bg-amber-50 border-amber-200" : "")}>
          <CardHeader className="p-4 pb-1"><CardTitle className="text-xs">قيد الانتظار</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-xl font-bold">{stats.pendingCount} <span className="text-xs text-muted-foreground">سجل</span></div>
          </CardContent>
        </Card>
        <Card className="hidden lg:block">
          <CardHeader className="p-4 pb-1"><CardTitle className="text-xs">عدد الموظفين</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-xl font-bold">{new Set(allRecords.map(r => r.employeeId)).size}</div>
          </CardContent>
        </Card>
         <Card className="hidden lg:block">
          <CardHeader className="p-4 pb-1"><CardTitle className="text-xs">إجمالي السجلات</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
             <div className="text-xl font-bold">{allRecords.length}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>كشف طلبات الوقت الإضافي</CardTitle></CardHeader>
        <CardContent>
          {/* Desktop View */}
          <div className="hidden md:block overflow-x-auto border rounded-md">
            <Table className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الموظف</TableHead>
                  <TableHead className="text-right">الانصراف (رسمي/فعلي)</TableHead>
                  <TableHead className="text-left font-bold text-primary">الإضافي</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  ))
                ) : allRecords.length > 0 ? (
                  allRecords.map(rec => (
                    <TableRow key={rec.id} className={cn(!rec.overtimeStatus && "bg-amber-50/30")}>
                      <TableCell className="text-right font-mono text-xs">{rec.date}</TableCell>
                      <TableCell className="text-right font-bold">{rec.employeeName}</TableCell>
                      <TableCell className="text-right text-[10px] text-muted-foreground">
                        {rec.officialCheckOutTime} / {rec.checkOut ? new Date(rec.checkOut).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'}) : '-'}
                      </TableCell>
                      <TableCell className="text-left font-mono font-bold text-primary">
                        +{rec.overtimeStatus === 'approved' ? rec.overtimeMinutes : rec.potentialOvertime} د
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={rec.overtimeStatus === 'approved' ? 'secondary' : rec.overtimeStatus === 'rejected' ? 'destructive' : 'outline'} 
                               className={cn(rec.overtimeStatus === 'approved' && "bg-green-100 text-green-800")}>
                            {rec.overtimeStatus === 'approved' ? 'معتمد' : rec.overtimeStatus === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex justify-center gap-1">
                            {(!rec.overtimeStatus || rec.overtimeStatus === 'pending') ? (
                                <>
                                    <Button size="icon" variant="outline" className="h-7 w-7 text-green-600 border-green-200" onClick={() => handleAction(rec, 'approved')}><Check className="h-4 w-4"/></Button>
                                    <Button size="icon" variant="outline" className="h-7 w-7 text-red-600 border-red-200" onClick={() => handleAction(rec, 'rejected')}><X className="h-4 w-4"/></Button>
                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(rec)}><Edit2 className="h-3 w-3"/></Button>
                                </>
                            ) : (
                                <Button size="sm" variant="ghost" className="text-xs" onClick={() => openEdit(rec)}>تعديل القرار</Button>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">لا توجد سجلات.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Mobile View */}
          <div className="md:hidden space-y-4">
             {isLoading ? Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-32 w-full rounded-lg"/>) :
              allRecords.map(rec => (
                <Card key={rec.id} className={cn("border-l-4", rec.overtimeStatus === 'approved' ? "border-l-green-500" : rec.overtimeStatus === 'rejected' ? "border-l-red-500" : "border-l-amber-500")}>
                    <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-bold">{rec.employeeName}</h4>
                                <p className="text-xs text-muted-foreground">{rec.date} | انصراف: {rec.checkOut ? new Date(rec.checkOut).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'}) : '-'}</p>
                            </div>
                            <Badge variant={rec.overtimeStatus === 'approved' ? 'secondary' : rec.overtimeStatus === 'rejected' ? 'destructive' : 'outline'}>
                                {rec.overtimeStatus === 'approved' ? 'معتمد' : rec.overtimeStatus === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center bg-muted/30 p-2 rounded">
                            <span className="text-xs text-muted-foreground">الوقت الإضافي:</span>
                            <span className="font-bold text-primary">+{rec.overtimeStatus === 'approved' ? rec.overtimeMinutes : rec.potentialOvertime} دقيقة</span>
                        </div>
                        <div className="flex gap-2 pt-1">
                             <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 h-9" onClick={() => handleAction(rec, 'approved')} disabled={rec.overtimeStatus === 'approved'}>
                                <Check className="ml-1 h-4 w-4"/> اعتماد
                             </Button>
                             <Button size="sm" variant="outline" className="flex-1 text-red-600 border-red-200 h-9" onClick={() => handleAction(rec, 'rejected')} disabled={rec.overtimeStatus === 'rejected'}>
                                <X className="ml-1 h-4 w-4"/> رفض
                             </Button>
                             <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0" onClick={() => openEdit(rec)}><Edit2 className="h-4 w-4"/></Button>
                        </div>
                    </CardContent>
                </Card>
              ))
             }
          </div>
        </CardContent>
      </Card>

      {/* Edit/Approve Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent>
              <DialogHeader><DialogTitle>مراجعة الوقت الإضافي</DialogTitle></DialogHeader>
              <div className="py-4 space-y-4">
                  <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg">
                      <AlertCircle className="h-5 w-5 text-primary" />
                      <div className="text-sm">
                          <p className="font-bold">{selectedRecord?.employeeName}</p>
                          <p className="text-muted-foreground">تاريخ: {selectedRecord?.date}</p>
                      </div>
                  </div>
                  <div className="space-y-2">
                      <Label>عدد الدقائق المعتمدة</Label>
                      <Input type="number" value={editMinutes} onChange={e => setEditMinutes(e.target.value)} />
                      <p className="text-[10px] text-muted-foreground">الوقت الفعلي المسجل: {selectedRecord?.potentialOvertime} دقيقة.</p>
                  </div>
              </div>
              <DialogFooter className="flex flex-row gap-2">
                  <Button variant="destructive" className="flex-1" onClick={() => handleAction(selectedRecord, 'rejected')} disabled={isProcessing}>رفض الطلب</Button>
                  <Button className="flex-1" onClick={() => handleAction(selectedRecord, 'approved', parseInt(editMinutes))} disabled={isProcessing}>
                    {isProcessing ? <Loader2 className="h-4 w-4 animate-spin"/> : <Check className="ml-2 h-4 w-4"/>}
                    اعتماد {editMinutes} د
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
    </div>
  );
}
