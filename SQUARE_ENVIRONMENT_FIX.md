# Square Environment Mismatch Fix

## Error
```
Web Payments SDK was initialized with an application ID created in production however you are currently using sandbox.
```

## Root Cause
- Railway has a **production** Square Application ID configured
- But `REACT_APP_SQUARE_ENVIRONMENT` is missing/set to `sandbox`
- Square SDK detects this mismatch and throws an error

## Solution

### Add to Railway Environment Variables (web-portal service):
```
REACT_APP_SQUARE_ENVIRONMENT=production
```

## Verification Steps

1. **Check current Railway environment variables** in web-portal service
2. **Add the missing environment variable**:
   - Variable: `REACT_APP_SQUARE_ENVIRONMENT` 
   - Value: `production`
3. **Redeploy** the web-portal service
4. **Test** payment functionality

## Alternative Solutions

### If you want to use Sandbox mode:
Replace your Railway Square credentials with sandbox ones:
```
REACT_APP_SQUARE_APPLICATION_ID=sandbox-sq0idb-XXXXXXXXXXXXXXXXXX
REACT_APP_SQUARE_LOCATION_ID=LXXXXXXXXXX
REACT_APP_SQUARE_ENVIRONMENT=sandbox
```

### If you want to use Production mode (Recommended):
Keep your production credentials and add:
```
REACT_APP_SQUARE_ENVIRONMENT=production  
```

## How to Check Your Square Application ID Type

**Sandbox Application IDs** start with: `sandbox-sq0idb-`
**Production Application IDs** start with: `sq0idp-` or similar

## Testing After Fix

### Production Mode Test Cards:
- Use real credit card numbers for testing
- Small amounts (like $0.01) for testing
- **Be careful** - these are real transactions!

### Sandbox Mode Test Cards:
- Visa Success: `4111 1111 1111 1111`
- Visa Decline: `4000 0000 0000 0002`  
- CVV: Any 3 digits
- Expiry: Any future date

## Related Files Modified
- `web-portal/.env` - Added explicit sandbox environment
- `web-portal/.env.railway.production` - Railway production config
- `web-portal/src/utils/square.ts` - Fixed environment variable name
- `web-portal/src/components/Payment/SquarePaymentForm.tsx` - Dynamic environment display