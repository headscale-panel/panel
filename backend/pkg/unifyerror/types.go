package unifyerror

// Error type constants used to determine logging behavior and user-facing message.
const (
	ErrTypeServer = iota // Server-side error – logged, generic message shown to user
	ErrTypeUser          // Client/user error – not logged, specific message shown to user
	ErrTypeDb            // Database error – logged, generic message shown to user
	ErrTypeGRPC          // gRPC / third-party service error – logged, specific message shown
	ErrTypeHttp          // HTTP-semantic error (404, etc.) – not logged, message shown as-is
)

// UniErr is the base error value type. It carries HTTP status, an application
// error code, and the user-facing message. Create instances via the constructor
// functions (ServerError, WrongParam, etc.) rather than directly.
type UniErr struct {
	HttpCode int    `json:"-"`
	Code     int    `json:"code"`
	Msg      string `json:"msg"`
	Data     any    `json:"data,omitempty"`
	Request  string `json:"request"`
}

// ApiException wraps UniErr to satisfy the error interface and is returned as
// the JSON response body on error.
type ApiException struct {
	UniErr
}

func (e *ApiException) Error() string {
	return e.Msg
}

// Handle converts a UniErr into an ApiException ready to be written as a
// gin JSON response.
func (e *UniErr) Handle() *ApiException {
	return &ApiException{UniErr{
		HttpCode: e.HttpCode,
		Code:     e.Code,
		Msg:      e.Msg,
		Data:     e.Data,
		Request:  e.Request,
	}}
}

// New constructs a UniErr without implicit logging side effects.
func New(httpCode, code int, msg string) *UniErr {
	return &UniErr{HttpCode: httpCode, Code: code, Msg: msg}
}

// WithData attaches optional payload data to an error response.
func (e *UniErr) WithData(data any) *UniErr {
	if e == nil {
		return nil
	}
	e.Data = data
	return e
}

// Error implements the error interface so UniErr can be used directly in
// Go error chains.
func (e *UniErr) Error() string {
	return e.Msg
}
